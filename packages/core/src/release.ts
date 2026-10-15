import { maxLevel, uniqueSorted } from "./util.js";

import type { TallyConfig } from "./config.js";
import type { Warning } from "./errors.js";
import type { AttributedChange, RangeFacts, UnitFacts } from "./facts.js";
import type {
	BumpLevel,
	Change,
	PreCtx,
	Unit,
	VersionScheme,
} from "./plugin.js";

const DEFAULT_TYPES: Readonly<Record<string, BumpLevel>> = {
	feat: "minor",
	fix: "patch",
	perf: "patch",
	revert: "patch",
};

interface CommitValues {
	sha?: string;
	/** Qualified values for the unit, else plain values of an attributed commit. */
	values: string[];
}

/** Release-As values per commit for one unit, in range order. */
const commitValues = (
	id: string,
	changes: readonly AttributedChange[],
): CommitValues[] => {
	const commits = new Map<
		string,
		{ sha?: string; qualified: string[]; plain: string[] }
	>();
	changes.forEach(({ change, units }, i) => {
		const key = change.sha ?? `#${String(i)}`;
		const entry = commits.get(key) ?? {
			...(change.sha === undefined ? {} : { sha: change.sha }),
			qualified: [],
			plain: [],
		};
		commits.set(key, entry);
		for (const r of change.releaseAs ?? []) {
			if (r.unit === id) {
				entry.qualified.push(r.version);
			} else if (r.unit === undefined && units.includes(id)) {
				entry.plain.push(r.version);
			}
		}
	});

	return [...commits.values()].map(({ qualified, plain, ...rest }) => ({
		...rest,
		values: qualified.length > 0 ? qualified : plain,
	}));
};

const at = (sha: string | undefined) => (sha === undefined ? "" : ` in ${sha}`);

/** A Release-As value without a single leading `v`, parsed by the scheme. */
const parseReleaseAs = <V>(scheme: VersionScheme<V>, raw: string) =>
	scheme.parse(raw.startsWith("v") ? raw.slice(1) : raw);

/** Why a parsed Release-As value is ignored, else undefined. */
const releaseAsProblem = <V>(
	scheme: VersionScheme<V>,
	version: V,
	from: { raw: string; version: V } | undefined,
): string | undefined => {
	if (scheme.isPrerelease(version)) {
		return "is a prerelease";
	}

	return from && scheme.compare(version, from.version) <= 0
		? `does not exceed ${from.raw}`
		: undefined;
};

/** Newest valid value wins; invalid values and other values warn. */
const pickReleaseAs = <V>(
	input: {
		unit: Unit;
		scheme: VersionScheme<V>;
		from: { raw: string; version: V } | undefined;
		commits: readonly CommitValues[];
	},
	warnings: Warning[],
): ReleaseAsWinner<V> | undefined => {
	const { unit, scheme, from, commits } = input;
	let winner: ReleaseAsWinner<V> | undefined;
	for (const { sha, values } of commits) {
		for (const raw of values) {
			const version = parseReleaseAs(scheme, raw);
			const problem =
				version === undefined
					? `is not a ${unit.scheme} version`
					: releaseAsProblem(scheme, version, from);
			if (problem !== undefined || version === undefined) {
				warnings.push({
					code: "W_RELEASE_AS_INVALID",
					message: `unit "${unit.id}": Release-As "${raw}"${at(sha)} ${problem ?? ""}; ignored`,
					unit: unit.id,
				});
			} else if (!winner) {
				winner = { ...(sha === undefined ? {} : { sha }), raw, version };
			} else if (scheme.compare(version, winner.version) !== 0) {
				warnings.push({
					code: "W_RELEASE_AS_CONFLICT",
					message: `unit "${unit.id}": Release-As "${winner.raw}"${at(winner.sha)} wins over "${raw}"${at(sha)}`,
					unit: unit.id,
				});
			}
		}
	}

	return winner;
};

/**
 * Max level over the changes. While the major is 0, breaking changes use
 * `preMajor.breaking` and changes whose type level is minor `preMajor.feat`.
 * Absorbed changes are capped at minor.
 */
const ownBump = (
	changes: readonly UnitChange[],
	settings: ReleaseSettings,
	preMajor: boolean,
): BumpLevel | null =>
	changes.reduce<BumpLevel | null>((bump, { change, via }) => {
		const typed = settings.bumps.get(change.type) ?? null;
		const level = change.breaking
			? preMajor
				? settings.preMajor.breaking
				: "major"
			: preMajor && typed === "minor"
				? settings.preMajor.feat
				: typed;

		return maxLevel(
			bump,
			via !== undefined && level === "major" ? "minor" : level,
		);
	}, null);

/** Changes of the range attributed to the unit or to an absorbed unit. */
const unitChanges = (
	id: string,
	range: RangeFacts,
	absorbed: ReadonlySet<string>,
): UnitChange[] =>
	range.changes.flatMap(({ change, units }) => {
		if (units.includes(id)) {
			return [{ change }];
		}

		const via = units.find((u) => absorbed.has(u));

		return via === undefined ? [] : [{ change, via }];
	});

/** Warns when a first release's initial version is not above the unit's highest prerelease tag. */
const initialBelowPrerelease = <V>(
	scheme: VersionScheme<V>,
	initial: V,
	facts: UnitFacts,
): Warning[] => {
	const highest = facts.tags
		.filter((t) => {
			const v = scheme.parse(t.version);

			return v !== undefined && scheme.isPrerelease(v);
		})
		.at(-1);
	const version = highest && scheme.parse(highest.version);
	if (!highest || version === undefined) {
		return [];
	}

	return scheme.compare(initial, version) > 0
		? []
		: [
				{
					code: "W_INITIAL_BELOW_PRERELEASE",
					message: `unit "${facts.id}": initial version ${scheme.format(initial)} does not exceed prerelease tag "${highest.name}"`,
					unit: facts.id,
				},
			];
};

/** Normalized value of the first valid Release-As of a commit. */
const appliedValue = <V>(
	scheme: VersionScheme<V>,
	values: readonly string[],
): string | undefined => {
	for (const raw of values) {
		const version = parseReleaseAs(scheme, raw);
		if (version !== undefined && !scheme.isPrerelease(version)) {
			return scheme.format(version);
		}
	}

	return undefined;
};

const fromOf = <V>(scheme: VersionScheme<V>, facts: UnitFacts) => {
	const base = facts.baseTag;
	const version = base === null ? undefined : scheme.parse(base.version);

	return base === null || version === undefined
		? undefined
		: { raw: base.version, version };
};

/** The Release-As footer value that applies to a unit. */
export interface ReleaseAsWinner<V> {
	readonly sha?: string;
	/** As written in the footer. */
	readonly raw: string;
	readonly version: V;
}

/** A normalized branch rule. */
export interface BranchRule {
	readonly name: string;
	readonly line: "default" | "maintenance";
	readonly channel: string | null;
}

/** Release config with defaults applied. */
export interface ReleaseSettings {
	/** Commit type to level. */
	readonly bumps: ReadonlyMap<string, BumpLevel>;
	/** Levels used while `core(from).major == 0`. */
	readonly preMajor: { readonly breaking: BumpLevel; readonly feat: BumpLevel };
	/** In config order. */
	readonly branches: readonly BranchRule[];
}

/**
 * A Change of a released unit; `via` names the first absorbed unit (by id) a
 * change not attributed to the unit came through.
 */
export interface UnitChange {
	readonly change: Change;
	readonly via?: string;
}

/** Bump inputs of a released unit, before propagation. */
export interface UnitIntent<V> {
	/** Own and absorbed level. */
	readonly bump: BumpLevel | null;
	readonly releaseAs: ReleaseAsWinner<V> | undefined;
	/** Core commit order. */
	readonly changes: readonly UnitChange[];
	/** Absorbed units of the changes with `via`, sorted. */
	readonly absorbedFrom: readonly string[];
	/** Release-As value per commit sha, for the plan's change list. */
	readonly releaseAsBySha: ReadonlyMap<string, string>;
}

export interface UnitRelease {
	readonly from: string | null;
	readonly bump: BumpLevel | null;
	readonly releaseAs: string | null;
	/** The footer that set `releaseAs`. */
	readonly releaseAsFooter: {
		readonly sha?: string;
		readonly raw: string;
	} | null;
	/** Null without a pending bump or Release-As. */
	readonly next: string | null;
	/** Prerelease of `next` on `channel`; null without a channel or `next`. */
	readonly prerelease: string | null;
}

export interface ReleaseInput<V> {
	readonly unit: Unit;
	readonly scheme: VersionScheme<V>;
	readonly settings: ReleaseSettings;
	readonly facts: UnitFacts;
	/** The range of `facts.from`. */
	readonly range: RangeFacts;
	/** Unreleased units absorbed by the unit (`reach`). */
	readonly absorbed: ReadonlySet<string>;
	readonly head: string;
	readonly channel: string | null;
}

/**
 * Unreleased units reachable over `id`'s dependencies, never stepping into or
 * through a released unit.
 */
export const reach = (
	id: string,
	dependencies: ReadonlyMap<string, readonly string[]>,
	released: ReadonlySet<string>,
): Set<string> => {
	const found = new Set<string>();
	const queue = [id];
	for (const v of queue) {
		for (const w of dependencies.get(v) ?? []) {
			if (!released.has(w) && !found.has(w)) {
				found.add(w);
				queue.push(w);
			}
		}
	}

	return found;
};

/** Applies the defaults to `bumps` and `branches`. */
export const releaseSettings = (config: TallyConfig): ReleaseSettings => ({
	bumps: new Map(Object.entries({ ...DEFAULT_TYPES, ...config.bumps?.types })),
	preMajor: {
		breaking: config.bumps?.preMajor?.breaking ?? "minor",
		feat: config.bumps?.preMajor?.feat ?? "minor",
	},
	branches: (config.branches ?? []).map((b) => ({
		name: b.name,
		line: b.line,
		channel: b.channel ?? null,
	})),
});

/**
 * Warns for qualified Release-As values naming unknown or unreleased units and
 * for plain values on commits attributed to no released unit.
 */
export const releaseAsWarnings = (
	units: readonly Unit[],
	ranges: readonly RangeFacts[],
): Warning[] => {
	const known = new Set(units.map((u) => u.id));
	const released = new Set(
		units.filter((u) => u.version !== "none").map((u) => u.id),
	);
	const warnings = new Map<string, Warning>();
	const warn = (code: string, message: string, unit?: string) => {
		warnings.set(`${code}\0${message}`, {
			code,
			message,
			...(unit === undefined ? {} : { unit }),
		});
	};

	for (const { changes } of ranges) {
		for (const { change, units: owners } of changes) {
			for (const { unit, version } of change.releaseAs ?? []) {
				if (unit === undefined) {
					if (!owners.some((id) => released.has(id))) {
						warn(
							"W_RELEASE_AS_IGNORED",
							`Release-As "${version}"${at(change.sha)} is not attributed to a released unit`,
						);
					}
				} else if (!known.has(unit)) {
					warn(
						"W_RELEASE_AS_UNKNOWN",
						`Release-As "${unit}@${version}"${at(change.sha)} names unknown unit "${unit}"`,
					);
				} else if (!released.has(unit)) {
					warn(
						"W_RELEASE_AS_IGNORED",
						`Release-As "${unit}@${version}"${at(change.sha)} names unreleased unit "${unit}"`,
						unit,
					);
				}
			}
		}
	}

	return [...warnings.values()];
};

/**
 * Own and absorbed bump and Release-As of a released unit. Release-As values
 * are read newest first (core commit order); a single leading `v` is
 * stripped, as release-please does. Footers are not absorbed.
 */
export const unitIntent = <V>(
	input: ReleaseInput<V>,
	warnings: Warning[],
): UnitIntent<V> => {
	const { unit, scheme, facts } = input;
	const from = fromOf(scheme, facts);
	const changes = unitChanges(unit.id, input.range, input.absorbed);
	const commits = commitValues(unit.id, input.range.changes);

	return {
		bump: ownBump(
			changes,
			input.settings,
			from !== undefined && scheme.core(from.version).major === 0,
		),
		releaseAs: pickReleaseAs({ unit, scheme, from, commits }, warnings),
		changes,
		absorbedFrom: uniqueSorted(
			input.range.changes.flatMap(({ units }) =>
				units.includes(unit.id)
					? []
					: units.filter((u) => input.absorbed.has(u)),
			),
		),
		releaseAsBySha: new Map(
			commits.flatMap(({ sha, values }) => {
				const value = appliedValue(scheme, values);

				return sha === undefined || value === undefined ? [] : [[sha, value]];
			}),
		),
	};
};

/**
 * `next` and prerelease of a released unit from its bump after propagation;
 * Release-As overrides `next`.
 */
export const releaseUnit = <V>(
	input: ReleaseInput<V>,
	intent: { bump: BumpLevel | null; releaseAs: ReleaseAsWinner<V> | undefined },
	warnings: Warning[],
): UnitRelease => {
	const { unit, scheme, facts } = input;
	const { bump } = intent;
	const releaseAs = intent.releaseAs?.version;
	const base = facts.baseTag;
	const from = fromOf(scheme, facts);
	const initial =
		(unit.initialVersion === null
			? undefined
			: scheme.parse(unit.initialVersion)) ?? scheme.initial();
	const bumped =
		bump === null
			? undefined
			: from === undefined
				? initial
				: scheme.bump(from.version, bump);
	const raw = releaseAs ?? bumped;
	if (from === undefined && releaseAs === undefined && bumped !== undefined) {
		warnings.push(...initialBelowPrerelease(scheme, initial, facts));
	}

	const ctx: PreCtx = {
		unit,
		head: input.head,
		baseTag: base?.name ?? null,
		tags: facts.tags.map((t) => t.name),
		firstParent: { sinceLineBase: facts.sinceLineBase, total: facts.total },
	};
	const { channel } = input;

	return {
		from: base?.version ?? null,
		bump,
		releaseAs: releaseAs === undefined ? null : scheme.format(releaseAs),
		releaseAsFooter: intent.releaseAs
			? {
					...(intent.releaseAs.sha === undefined
						? {}
						: { sha: intent.releaseAs.sha }),
					raw: intent.releaseAs.raw,
				}
			: null,
		next: raw === undefined ? null : scheme.format(scheme.release(raw, ctx)),
		prerelease:
			raw === undefined || channel === null
				? null
				: scheme.format(scheme.prerelease(raw, { ...ctx, channel })),
	};
};
