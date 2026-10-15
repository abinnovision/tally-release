import type { TallyConfig } from "./config.js";
import type { Warning } from "./errors.js";
import type { AttributedChange, RangeFacts, UnitFacts } from "./facts.js";
import type { BumpLevel, PreCtx, Unit, VersionScheme } from "./plugin.js";

const LEVELS: readonly BumpLevel[] = ["patch", "minor", "major"];

const DEFAULT_TYPES: Readonly<Record<string, BumpLevel>> = {
	feat: "minor",
	fix: "patch",
	perf: "patch",
	revert: "patch",
};

const maxLevel = (
	a: BumpLevel | null,
	b: BumpLevel | null,
): BumpLevel | null =>
	a === null || (b !== null && LEVELS.indexOf(b) > LEVELS.indexOf(a)) ? b : a;

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
): V | undefined => {
	const { unit, scheme, from, commits } = input;
	let winner: { sha?: string; raw: string; version: V } | undefined;
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
				});
			} else if (!winner) {
				winner = { ...(sha === undefined ? {} : { sha }), raw, version };
			} else if (scheme.compare(version, winner.version) !== 0) {
				warnings.push({
					code: "W_RELEASE_AS_CONFLICT",
					message: `unit "${unit.id}": Release-As "${winner.raw}"${at(winner.sha)} wins over "${raw}"${at(sha)}`,
				});
			}
		}
	}

	return winner?.version;
};

/**
 * Max level over the changes. While the major is 0, breaking changes use
 * `preMajor.breaking` and changes whose type level is minor `preMajor.feat`.
 */
const ownBump = (
	changes: readonly AttributedChange[],
	settings: ReleaseSettings,
	preMajor: boolean,
): BumpLevel | null =>
	changes.reduce<BumpLevel | null>((bump, { change }) => {
		if (change.breaking) {
			return maxLevel(bump, preMajor ? settings.preMajor.breaking : "major");
		}

		const level = settings.bumps.get(change.type) ?? null;

		return maxLevel(
			bump,
			preMajor && level === "minor" ? settings.preMajor.feat : level,
		);
	}, null);

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

export interface UnitRelease {
	readonly from: string | null;
	readonly bump: BumpLevel | null;
	readonly releaseAs: string | null;
	/** Null without a pending bump or Release-As. */
	readonly next: string | null;
	/** Prerelease of `next` on `channel`; null without a channel or `next`. */
	readonly prerelease: string | null;
	/** Release-As value per commit sha, for the plan's change list. */
	readonly releaseAsBySha: ReadonlyMap<string, string>;
}

export interface ReleaseInput<V> {
	readonly unit: Unit;
	readonly scheme: VersionScheme<V>;
	readonly settings: ReleaseSettings;
	readonly facts: UnitFacts;
	/** The range of `facts.from`. */
	readonly range: RangeFacts;
	readonly head: string;
	readonly channel: string | null;
}

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
	const warn = (code: string, message: string) => {
		warnings.set(`${code}\0${message}`, { code, message });
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
					);
				}
			}
		}
	}

	return [...warnings.values()];
};

/**
 * Own bump, Release-As and first release of a released unit. Release-As
 * values are read newest first (core commit order); a single leading `v` is
 * stripped, as release-please does.
 */
export const releaseUnit = <V>(
	input: ReleaseInput<V>,
	warnings: Warning[],
): UnitRelease => {
	const { unit, scheme, facts } = input;
	const base = facts.baseTag;
	const fromVersion = base === null ? undefined : scheme.parse(base.version);
	const from =
		base === null || fromVersion === undefined
			? undefined
			: { raw: base.version, version: fromVersion };
	const bump = ownBump(
		facts.changes,
		input.settings,
		from !== undefined && scheme.core(from.version).major === 0,
	);

	const commits = commitValues(unit.id, input.range.changes);
	const releaseAs = pickReleaseAs({ unit, scheme, from, commits }, warnings);
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
		next: raw === undefined ? null : scheme.format(scheme.release(raw, ctx)),
		prerelease:
			raw === undefined || channel === null
				? null
				: scheme.format(scheme.prerelease(raw, { ...ctx, channel })),
		releaseAsBySha: new Map(
			commits.flatMap(({ sha, values }) => {
				const value = appliedValue(scheme, values);

				return sha === undefined || value === undefined ? [] : [[sha, value]];
			}),
		),
	};
};
