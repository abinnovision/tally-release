import {
	computePlan,
	encodeMarker,
	releaseEntries,
	releaseFiles,
	releaseItems,
	TallyError,
} from "@tallyrelease/core";

import { effectSkipped } from "./effects.js";
import { planOptions } from "./plan.js";
import { LABELS } from "../forge/forge.js";

import type { Forge, ReleasePr, RepoRef } from "../forge/forge.js";
import type { Session } from "../session.js";
import type { ReleaseItem } from "@tallyrelease/core";

/** Body limit with headroom below GitHub's 65,536 characters. */
const BODY_LIMIT = 60_000;

/** GitHub's PR title limit. */
const TITLE_LIMIT = 256;

const TRUNCATED =
	"_The changelog is truncated; the CHANGELOG.md files of this pull request hold all of it._";

const short = (sha: string) => sha.slice(0, 7);

/** Per-unit changelog sections, cut to whole sections under the limit, then the marker. */
const prBody = (
	items: readonly ReleaseItem[],
	sections: ReadonlyMap<string, string>,
	marker: string,
): string => {
	const blocks = items.flatMap((item) =>
		item.units.flatMap((id) => {
			const section = sections.get(id);

			return section === undefined
				? []
				: [
						`<details><summary>${id}: ${item.version}</summary>\n\n${section}\n</details>\n\n`,
					];
		}),
	);
	const budget = BODY_LIMIT - marker.length - TRUNCATED.length - 4;
	let text = "";
	for (const block of blocks) {
		if (text.length + block.length > budget) {
			text += `${TRUNCATED}\n\n`;
			break;
		}

		text += block;
	}

	return `${text}${marker}\n`;
};

interface PrTarget {
	forge: Forge;
	repo: RepoRef;
	base: string;
	dryRun: boolean | undefined;
}

/**
 * Creates the PR of `p` or updates its title, body and pending label;
 * returns the output line. A 422 on create means an open PR without the
 * pending label exists for the branch, which is then updated.
 */
const upsertPr = async (
	{ forge, repo, base, dryRun }: PrTarget,
	p: { branch: string; title: string; body: string; pr: ReleasePr | undefined },
): Promise<string> => {
	let { pr } = p;
	if (pr === undefined) {
		if (dryRun) {
			return `would create PR ${p.branch}: ${p.title}`;
		}

		try {
			const number = await forge.createPr(repo, {
				head: p.branch,
				base,
				title: p.title,
				body: p.body,
			});
			await forge.setLabel(repo, number, { label: LABELS.pending });

			return `created PR #${String(number)} ${p.branch}: ${p.title}`;
		} catch (error) {
			pr =
				(error as { status?: unknown } | null)?.status === 422
					? await forge.openPr(repo, { head: p.branch, base })
					: undefined;
			if (pr === undefined) {
				throw error;
			}
		}
	}

	const edit = pr.body !== p.body;
	if (!edit && pr.labels.includes(LABELS.pending)) {
		return `PR #${String(pr.number)} ${p.branch} is up to date`;
	}

	if (!dryRun) {
		if (edit) {
			await forge.updatePr(repo, pr.number, { title: p.title, body: p.body });
		}

		await forge.setLabel(repo, pr.number, { label: LABELS.pending });
	}

	return `${dryRun ? "would update" : "updated"} PR #${String(pr.number)} ${p.branch}: ${p.title}`;
};

/** `GITHUB_REPOSITORY`, else owner and name from the repository URL. */
export const repoRef = async (session: Session): Promise<RepoRef> => {
	const [owner, repo] =
		session.env["GITHUB_REPOSITORY"]?.split("/") ??
		(await session.repoUrl())?.split("/").slice(-2) ??
		[];
	if (!owner || !repo) {
		throw new TallyError(
			"E_NO_FORGE",
			"the forge repository is unknown; set GITHUB_REPOSITORY or an origin remote",
		);
	}

	return { owner, repo };
};

export interface PrFlags {
	branch?: string;
	dryRun?: boolean;
}

export interface PrOptions {
	/** Merged release PRs reconciled earlier in this run; the pending guard skips them. */
	reconciled?: ReadonlySet<number>;
}

/**
 * Creates, updates and closes release PRs so that each pending release item
 * is proposed once: shared items in one PR, separate items in their own.
 */
export const releasePrs = async (
	session: Session,
	flags: PrFlags,
	opts: PrOptions = {},
): Promise<void> => {
	if (effectSkipped(session, "pr")) {
		return;
	}

	const setup = await planOptions(session, flags);
	const repoUrl = await session.repoUrl();
	const date = session.clock().toISOString().slice(0, 10);
	const planned = await session.workspaceAt(null, async (workspace, fs) => {
		const plan = await computePlan(workspace, session.git, {
			...setup.opts,
			fs,
			all: true,
		});
		if (effectSkipped(session, "pr", plan)) {
			return undefined;
		}

		const byLeaf = new Map<string, ReleaseItem[]>();
		for (const item of releaseItems(workspace, plan)) {
			const leaf = item.mode === "shared" ? "shared" : item.name;
			byLeaf.set(leaf, [...(byLeaf.get(leaf) ?? []), item]);
		}

		const desired = await Promise.all(
			[...byLeaf].map(async ([leaf, items]) => {
				const title = `chore(release): ${items.map((i) => `${i.name}@${i.version}`).join(", ")}`;

				return {
					leaf,
					items,
					title:
						title.length <= TITLE_LIMIT
							? title
							: `chore(release): ${String(releaseEntries(items).length)} releases on ${plan.branch}`,
					...(await releaseFiles(workspace, plan, {
						fs,
						items,
						repoUrl,
						date,
					})),
				};
			}),
		);

		return { base: plan.branch, desired, warnings: plan.warnings };
	});
	if (planned === undefined) {
		return;
	}

	const { base, desired } = planned;
	session.warn([
		...planned.warnings,
		...setup.warnings,
		...desired.flatMap((d) => d.warnings),
	]);

	const { forge, gitWriter } = session;
	if (!forge) {
		throw new TallyError(
			"E_NO_FORGE",
			"pr needs a forge token; pass --token or set GITHUB_TOKEN",
		);
	}

	const repo = await repoRef(session);
	const { head } = setup.opts;
	const tip = await forge.branchSha(repo, base);
	if (tip !== head) {
		session.warn([
			{
				code: "W_PR_HEAD_BEHIND",
				message: `HEAD ${short(head)} is not the tip of "${base}" (${tip === undefined ? "missing" : short(tip)}); release PRs stay unchanged`,
			},
		]);

		return;
	}

	const merged = (
		await forge.releasePrs(repo, { base, state: "merged" })
	).filter((p) => opts.reconciled?.has(p.number) !== true);
	if (merged.length > 0) {
		const numbers = merged.map((p) => `#${String(p.number)}`).join(", ");
		throw new TallyError(
			"E_PENDING_RECONCILE",
			`merged release PRs ${numbers} are not tagged yet; run tallyrelease release first`,
			{ prs: merged.map((p) => p.number) },
		);
	}

	const prefix = `tallyrelease/release/${base}/`;
	const commitDate = await session.git.commitDate(head);
	// Oldest first, so the newest PR of a head wins.
	const listed = await forge.releasePrs(repo, { base, state: "open" });
	const open = new Map(listed.map((p) => [p.head, p]));
	const prs = await Promise.all(
		desired.map(async (d) => {
			const branch = `${prefix}${d.leaf}`;
			const sha = await gitWriter.commitFiles({
				parent: head,
				files: d.files,
				message: d.title,
				date: commitDate,
			});
			const marker = encodeMarker({
				head,
				releaseCommit: sha,
				releases: releaseEntries(d.items),
			});

			return {
				...d,
				branch,
				sha,
				pr: open.get(branch),
				lease: (await forge.branchSha(repo, branch)) ?? "",
				body: prBody(d.items, d.sections, marker),
			};
		}),
	);

	const lines: string[] = [];
	const pushes = prs.filter((p) => p.lease !== p.sha);
	if (flags.dryRun) {
		lines.push(...pushes.map((p) => `would push ${p.branch}`));
	} else if (pushes.length > 0) {
		await gitWriter.push(
			pushes.map((p) => `${p.sha}:refs/heads/${p.branch}`),
			{
				atomic: true,
				leases: Object.fromEntries(
					pushes.map((p) => [`refs/heads/${p.branch}`, p.lease]),
				),
				token: session.token,
			},
		);
	}

	/* eslint-disable no-await-in-loop -- sequential, avoids secondary rate limits */
	for (const p of prs) {
		lines.push(await upsertPr({ forge, repo, base, dryRun: flags.dryRun }, p));
	}

	// Undesired PRs and older duplicates of a head; branches go first, then the PRs.
	const wanted = new Set(prs.map((p) => p.branch));
	const unwanted = listed.filter(
		(p) => !wanted.has(p.head) || open.get(p.head) !== p,
	);
	if (!flags.dryRun) {
		const owned = [
			...new Set(
				unwanted
					.map((p) => p.head)
					.filter((h) => !wanted.has(h) && h.startsWith(prefix)),
			),
		];
		const leases = await Promise.all(
			owned.map(async (h) => [h, await forge.branchSha(repo, h)] as const),
		);
		const deletes = leases.filter(([, sha]) => sha !== undefined);
		if (deletes.length > 0) {
			await gitWriter.push(
				deletes.map(([h]) => `:refs/heads/${h}`),
				{
					leases: Object.fromEntries(
						deletes.map(([h, sha]) => [`refs/heads/${h}`, sha ?? ""]),
					),
					token: session.token,
				},
			);
		}
	}

	for (const p of unwanted) {
		if (!flags.dryRun) {
			await forge.closePr(
				repo,
				p.number,
				`tallyrelease closed this release PR: nothing in it is pending on \`${base}\` any more, or its releases moved to another release PR.`,
			);
		}

		lines.push(
			`${flags.dryRun ? "would close" : "closed"} PR #${String(p.number)} ${p.head}`,
		);
	}
	/* eslint-enable no-await-in-loop */

	session.stdout.write(
		lines.length > 0 ? `${lines.join("\n")}\n` : "no release PRs\n",
	);
};
