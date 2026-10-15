import { TallyError } from "@tallyrelease/core";
import { appendFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { baseLine, resolveBuildBase } from "../ci/base.js";
import { planGithubOutput } from "../ci/outputs.js";
import { alignColumns } from "../output/columns.js";
import { count } from "../output/count.js";
import { painter } from "../output/paint.js";
import { branchName } from "../session.js";
import { version } from "../version.js";

import type { BuildBase } from "../ci/base.js";
import type { Session } from "../session.js";
import type { Plan, PlanLine, PlanOptions, Warning } from "@tallyrelease/core";

const lineLabel = (line: PlanLine | null, branch: string): string =>
	line === null
		? `${branch} (no branch rule)`
		: `${branch} (rule ${line.rule}, ${line.kind} line${line.channel === null ? "" : `, channel ${line.channel}`})`;

const text = (session: Session, doc: Plan, base: BuildBase): string => {
	const paint = painter(session.stdout);
	const lines = [
		`${paint("bold", "branch")}  ${lineLabel(doc.line, doc.branch)}`,
		baseLine(paint, base),
		"",
	];
	if (doc.units.length === 0) {
		lines.push("no units planned");

		return `${lines.join("\n")}\n`;
	}

	const grouped = doc.units.some((u) => u.group !== null);
	const table = [
		[
			"UNIT",
			...(grouped ? ["GROUP"] : []),
			"KIND",
			"FROM",
			"BUMP",
			"NEXT",
			"VERSION",
		],
		...doc.units.map((u) => [
			u.id,
			...(grouped ? [u.group ?? "-"] : []),
			u.kind,
			u.from ?? "-",
			u.bump ?? "-",
			u.next ?? "-",
			u.version ?? "-",
		]),
	];
	// Header is aligned unstyled so column styles do not apply to it.
	const [header = ""] = alignColumns(table);
	const [, ...rows] = alignColumns(
		table,
		{ styles: grouped ? [undefined, "dim", "cyan"] : [undefined, "cyan"] },
		paint,
	);
	const kinds = (["prerelease", "rebuild", "none"] as const)
		.map((kind) => [kind, doc.units.filter((u) => u.kind === kind).length])
		.filter(([, n]) => n !== 0)
		.map(([kind, n]) => `${String(n)} ${String(kind)}`);
	lines.push(
		paint("bold", header),
		...rows,
		"",
		`${count(doc.units.length, "unit")} planned: ${kinds.join(", ")}`,
	);

	return `${lines.join("\n")}\n`;
};

export interface PlanFlags {
	branch?: string;
	base?: string;
	head?: string;
	all?: boolean;
	format?: "text" | "json";
	json?: boolean;
	out?: string;
	githubOutput?: boolean;
}

export interface PlanSetup {
	opts: Omit<PlanOptions, "fs">;
	/** `--head` sha, null to plan the working tree at HEAD. */
	ref: string | null;
	base: BuildBase;
	/** Base warnings and `W_HEAD_BRANCH`. */
	warnings: Warning[];
}

/**
 * Plan options for `--branch`, `--base` and `--head`. With `--head` only
 * `--base` and the local merge base apply, and files come from the commit.
 */
export const planOptions = async (
	session: Session,
	flags: Pick<PlanFlags, "branch" | "base" | "head">,
): Promise<PlanSetup> => {
	const { git } = session;
	const current = await git.resolve("HEAD");
	if (current === undefined) {
		// Surfaces E_NOT_A_REPO and E_NOT_REPO_ROOT first.
		await session.workspace();
		throw new TallyError(
			"E_NO_HEAD",
			"HEAD does not resolve to a commit; the repository has no commits",
		);
	}

	const head =
		flags.head === undefined ? current : await git.resolve(flags.head);
	if (head === undefined) {
		throw new TallyError(
			"E_HEAD_UNRESOLVED",
			`--head "${flags.head ?? ""}" does not resolve to a commit`,
			{ ref: flags.head },
		);
	}

	const replay = flags.head !== undefined;
	const base = await resolveBuildBase({
		git,
		head,
		env: replay ? {} : session.env,
		cliBase: flags.base,
		github: replay ? undefined : session.github,
		forge: replay ? undefined : session.forge,
	});

	const branch = flags.branch ?? (await branchName(session));
	const headBranch: Warning[] =
		replay && flags.branch === undefined
			? [
					{
						code: "W_HEAD_BRANCH",
						message: `planning --head under the branch rule for "${branch}"; pass --branch to choose`,
					},
				]
			: [];

	return {
		opts: {
			tool: `tallyrelease@${version}`,
			branch,
			head,
			base: base.base,
			baseSource: base.source,
		},
		ref: replay ? head : null,
		base,
		warnings: [...base.warnings, ...headBranch],
	};
};

/** Computes the release plan and writes the requested outputs. */
export const plan = async (
	session: Session,
	flags: PlanFlags,
): Promise<void> => {
	const { opts, ref, base, warnings } = await planOptions(session, flags);
	const planned = await session.planAt(ref, {
		...opts,
		all: flags.all ?? false,
	});
	const doc = { ...planned, warnings: [...planned.warnings, ...warnings] };
	session.warn(doc.warnings);

	const json = `${JSON.stringify(doc, null, 2)}\n`;
	const out =
		flags.out === undefined ? undefined : resolve(session.cwd, flags.out);
	if (out !== undefined) {
		writeFileSync(out, json);
	}

	if (flags.githubOutput) {
		const outputPath = session.env["GITHUB_OUTPUT"];
		if (!outputPath) {
			throw new TallyError(
				"E_GITHUB_OUTPUT",
				"--github-output requires GITHUB_OUTPUT to be set",
			);
		}

		const temp = session.env["RUNNER_TEMP"];
		if (out === undefined && !temp) {
			throw new TallyError(
				"E_GITHUB_OUTPUT",
				"--github-output requires --out or RUNNER_TEMP to be set",
			);
		}

		const path = out ?? join(temp ?? "", "tallyrelease-plan.json");
		if (out === undefined) {
			writeFileSync(path, json);
		}

		appendFileSync(outputPath, planGithubOutput(path));
	}

	const format = flags.format ?? (flags.json ? "json" : "text");
	session.stdout.write(format === "json" ? json : text(session, doc, base));
};
