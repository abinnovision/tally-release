import { attribution, matcher } from "./attribution.js";
import { TallyError } from "./errors.js";
import { pluginCtx, runHook } from "./plugins.js";
import { schemeRegistry } from "./schemes.js";
import { matchUnitTags } from "./tags.js";
import { compare, uniqueSorted } from "./util.js";

import type { Warning } from "./errors.js";
import type {
	Change,
	GitReader,
	RawCommit,
	ReadonlyFs,
	ReleaseAsValue,
} from "./plugin.js";
import type { UnitTag } from "./tags.js";
import type { Workspace } from "./workspace.js";

const instant = (commit: RawCommit): number => {
	const time = Date.parse(commit.date);
	if (Number.isNaN(time)) {
		throw new TallyError(
			"E_GIT_DATE",
			`commit ${commit.sha} has an invalid committer date "${commit.date}"`,
			{ sha: commit.sha, date: commit.date },
		);
	}

	return time;
};

/** Committer date descending, compared as instants, then sha. */
const byCommitOrder = (a: RawCommit, b: RawCommit): number =>
	instant(b) - instant(a) || compare(a.sha, b.sha);

const releaseAsKey = (r: ReleaseAsValue) => `${r.unit ?? ""}@${r.version}`;

/** Keeps the first commit-derived Change per dedupe key, unioning `releaseAs`. */
const dedupe = (changes: readonly Change[]): Change[] => {
	const kept: Change[] = [];
	const index = new Map<string, number>();
	for (const change of changes) {
		const key =
			change.sha === undefined
				? undefined
				: [
						change.sha,
						change.type,
						String(change.breaking),
						uniqueSorted(change.units ?? []).join(","),
					].join("\0");
		const at = key === undefined ? undefined : index.get(key);
		const prior = at === undefined ? undefined : kept[at];
		if (at === undefined || !prior) {
			if (key !== undefined) {
				index.set(key, kept.length);
			}

			kept.push(change);
			continue;
		}

		if (change.releaseAs) {
			const values = new Map(
				[...(prior.releaseAs ?? []), ...change.releaseAs].map((r) => [
					releaseAsKey(r),
					r,
				]),
			);
			kept[at] = { ...prior, releaseAs: [...values.values()] };
		}
	}

	return kept;
};

export interface FactsOptions {
	head: string;
	fs: ReadonlyFs;
	debug?: (message: string) => void;
}

/** A Change with the ids of the units it is attributed to. */
export interface AttributedChange {
	readonly change: Change;
	/** Sorted. */
	readonly units: readonly string[];
}

/**
 * Changes of `(from, head]`, in core commit order, attributed to all units. A
 * unit's consumers read only its own range (`UnitFacts.from`), filtered to the
 * unit and the units it absorbs.
 */
export interface RangeFacts {
	readonly from: string | null;
	readonly changes: readonly AttributedChange[];
}

export interface UnitFacts {
	readonly id: string;
	/** Range key: the base tag commit, null from the root. */
	readonly from: string | null;
	/** Every matched tag, reachable or not, scheme-sorted. */
	readonly tags: readonly UnitTag[];
	/** Highest stable tag merged into head. */
	readonly baseTag: UnitTag | null;
	/** Highest stable tag on head's first-parent chain. */
	readonly lineBaseTag: UnitTag | null;
	readonly sinceLineBase: number;
	readonly total: number;
	/** Changes since the base tag attributed to this unit, core commit order. */
	readonly changes: readonly AttributedChange[];
	/** Qualified Release-As values naming this unit, core commit order. */
	readonly releaseAs: readonly { sha?: string; version: string }[];
}

/** Git and intent data of every released unit, collected before release math. */
export interface PlanFacts {
	readonly head: string;
	/** Released units, sorted by id. */
	readonly units: readonly UnitFacts[];
	/** One entry per distinct base tag commit. */
	readonly ranges: readonly RangeFacts[];
	/** Every tag name, sorted. */
	readonly tagNames: readonly string[];
	/** Warnings logged by intent sources and for unknown explicit units. */
	readonly warnings: readonly Warning[];
}

/** Runs every `GitReader` and intent source call a plan needs. */
export const collectPlanFacts = async (
	workspace: Workspace,
	git: GitReader,
	opts: FactsOptions,
): Promise<PlanFacts> => {
	const { head } = opts;
	const warnings: Warning[] = [];
	const ctx = pluginCtx({ ...opts, repo: { name: workspace.repo } }, warnings);
	const intents = workspace.intents.map((entry) => ({
		...entry,
		ctx: ctx(entry.plugin, entry.options),
	}));
	const schemes = schemeRegistry(workspace.schemes);
	const allTags = await git.tags();
	const tags = matchUnitTags(workspace.units, allTags, schemes);
	const merged = new Set((await git.tagsMerged(head)).map((t) => t.name));
	const total = await git.countFirstParent(null, head);

	const ignored = matcher(workspace.ignore);
	const isGlobal = matcher(workspace.globalInputs);
	const owners = attribution(workspace.units);
	const known = new Set(workspace.units.map((u) => u.id));
	// File-less commits belong to every released unit (release-please parity).
	const released = workspace.units
		.filter((u) => u.version !== "none")
		.map((u) => u.id);
	const warned = new Set<string>();
	const warnUnknown = (plugin: string, changes: readonly Change[]) => {
		for (const id of changes.flatMap((c) => c.units ?? [])) {
			const key = `${plugin}\0${id}`;
			if (!known.has(id) && !warned.has(key)) {
				warned.add(key);
				warnings.push({
					code: "W_UNIT_UNKNOWN",
					message: `intent names unknown unit "${id}"`,
					plugin,
				});
			}
		}
	};

	const counts = new Map<string, number>();
	const countSince = async (sha: string): Promise<number> => {
		const cached = counts.get(sha);
		if (cached !== undefined) {
			return cached;
		}

		const count = await git.countFirstParent(sha, head);
		counts.set(sha, count);

		return count;
	};

	const ranges = new Map<string | null, RangeFacts>();
	const range = async (from: string | null): Promise<RangeFacts> => {
		const cached = ranges.get(from);
		if (cached) {
			return cached;
		}

		const commits = Object.freeze(
			[...(await git.log(from, head))].sort(byCommitOrder),
		);
		const position = new Map(commits.map((c, i) => [c.sha, i]));
		const commitUnits = new Map(
			commits.map((c) => [
				c.sha,
				c.files.length === 0
					? released
					: uniqueSorted(
							c.files
								.filter((f) => !ignored(f) && !isGlobal(f))
								.flatMap(owners),
						),
			]),
		);

		const changes: Change[] = [];
		for (const { plugin, source, ctx: sourceCtx } of intents) {
			// eslint-disable-next-line no-await-in-loop -- hooks run sequentially in config order
			const collected = await runHook(plugin, "intent", () =>
				source.collect(sourceCtx, { from, to: head, commits }),
			);
			warnUnknown(plugin, collected);
			changes.push(...collected);
		}

		const attributed = dedupe(changes)
			.map((change): AttributedChange => ({
				change,
				units: change.units
					? uniqueSorted(change.units.filter((id) => known.has(id)))
					: (commitUnits.get(change.sha ?? "") ?? []),
			}))
			.sort(
				(a, b) =>
					(position.get(a.change.sha ?? "") ?? commits.length) -
					(position.get(b.change.sha ?? "") ?? commits.length),
			);

		const result = { from, changes: attributed };
		ranges.set(from, result);

		return result;
	};

	const units: UnitFacts[] = [];
	for (const unit of workspace.units) {
		const matched = tags.get(unit.id);
		if (!matched) {
			// Unreleased.
			continue;
		}

		const { scheme, tags: unitTags } = matched;
		const stable = unitTags.filter(
			(t) =>
				merged.has(t.name) && !scheme.isPrerelease(scheme.parse(t.version)),
		);
		const baseTag = stable.at(-1) ?? null;
		let lineBaseTag: UnitTag | null = null;
		for (const tag of [...stable].reverse()) {
			// eslint-disable-next-line no-await-in-loop -- stops at the first match
			if (await git.isFirstParentAncestor(tag.sha, head)) {
				lineBaseTag = tag;
				break;
			}
		}

		// eslint-disable-next-line no-await-in-loop -- intent sources run sequentially
		const { from, changes } = await range(baseTag?.sha ?? null);
		units.push({
			id: unit.id,
			from,
			tags: unitTags,
			baseTag,
			lineBaseTag,
			sinceLineBase: lineBaseTag
				? // eslint-disable-next-line no-await-in-loop -- memoized per line base
					await countSince(lineBaseTag.sha)
				: total,
			total,
			changes: changes.filter((c) => c.units.includes(unit.id)),
			releaseAs: changes.flatMap(({ change }) =>
				(change.releaseAs ?? [])
					.filter((r) => r.unit === unit.id)
					.map((r) => ({
						...(change.sha === undefined ? {} : { sha: change.sha }),
						version: r.version,
					})),
			),
		});
	}

	return {
		head,
		units,
		ranges: [...ranges.values()],
		tagNames: uniqueSorted(allTags.map((t) => t.name)),
		warnings,
	};
};
