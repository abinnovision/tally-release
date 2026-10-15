import { computeAffected } from "./affected.js";
import { matchBranch } from "./branches.js";
import { collectPlanFacts } from "./facts.js";
import { releaseAsWarnings, releaseUnit } from "./release.js";
import { validateRelease } from "./validate.js";

import type {
	AffectedDoc,
	AffectedOptions,
	AffectedReason,
	AffectedUnit,
} from "./affected.js";
import type { Line } from "./branches.js";
import type { Warning } from "./errors.js";
import type { PlanFacts, UnitFacts } from "./facts.js";
import type {
	BumpLevel,
	GitReader,
	ReadonlyFs,
	Unit,
	VersionScheme,
} from "./plugin.js";
import type { UnitRelease } from "./release.js";
import type { Workspace } from "./workspace.js";

/**
 * Released units without a matching tag while some tag not matched by a
 * released unit contains their id, delimited by non-alphanumeric characters
 * or the tag's ends.
 */
const noMatchingTag = (workspace: Workspace, facts: PlanFacts): Warning[] => {
	const matched = new Set(
		facts.units.flatMap((f) => f.tags.map((t) => t.name)),
	);
	const tags = facts.tagNames.filter((t) => !matched.has(t));

	return facts.units.flatMap((f) => {
		const unit = workspace.units.find((u) => u.id === f.id);
		const id = new RegExp(
			`(?:^|[^A-Za-z0-9])${f.id.replaceAll(".", "\\.")}(?:[^A-Za-z0-9]|$)`,
			"u",
		);
		const similar = tags.find((t) => id.test(t));
		if (!unit || f.tags.length > 0 || similar === undefined) {
			return [];
		}

		return [
			{
				code: "W_NO_MATCHING_TAG",
				message: `released unit "${f.id}" has no tag matching "${unit.tagFormat.replaceAll("{id}", f.id)}", but "${similar}" contains its id`,
			},
		];
	});
};

const lineWarnings = (
	workspace: Workspace,
	branch: string,
	line: Line | null,
): Warning[] => {
	if (!line) {
		return [
			{
				code: "W_NO_BRANCH_RULE",
				message: `no branch rule matches "${branch}"; versions are null`,
			},
		];
	}

	return workspace.units.every((u) => u.version === "none")
		? [
				{
					code: "W_NO_RELEASED_UNITS",
					message: `branch rule "${line.rule}" matches, but no unit is released`,
				},
			]
		: [];
};

const planChanges = (
	facts: UnitFacts | undefined,
	release: UnitRelease,
): PlanChange[] =>
	(facts?.changes ?? []).map(({ change }) => {
		const releaseAs =
			change.sha === undefined
				? undefined
				: release.releaseAsBySha.get(change.sha);

		return {
			...(change.sha === undefined ? {} : { sha: change.sha }),
			type: change.type,
			breaking: change.breaking,
			...(change.scope === undefined ? {} : { scope: change.scope }),
			subject: change.subject,
			...(change.pr === undefined ? {} : { pr: change.pr }),
			...(releaseAs === undefined ? {} : { releaseAs }),
		};
	});

interface Entry {
	unit: Unit;
	hit: AffectedUnit | undefined;
	facts: UnitFacts | undefined;
	release: UnitRelease | undefined;
	head: string;
}

const UNRELEASED: UnitRelease = {
	from: null,
	bump: null,
	releaseAs: null,
	next: null,
	prerelease: null,
	releaseAsBySha: new Map(),
};

/** The unit's plan entry; undefined when it is not listed. */
const unitPlan = (entry: Entry, all: boolean): UnitPlan | undefined => {
	const { unit, hit, facts } = entry;
	const release = entry.release ?? UNRELEASED;
	if (!hit && !(release.next !== null && all)) {
		return undefined;
	}

	const { prerelease } = release;
	const kind = !hit ? "none" : prerelease === null ? "rebuild" : "prerelease";

	return {
		id: unit.id,
		path: unit.root,
		plugin: unit.plugin,
		scheme: unit.scheme,
		tags: [...unit.tags],
		group: null,
		affected: hit ? { reason: hit.reason, via: hit.via } : null,
		kind,
		baseTag: facts?.baseTag?.name ?? null,
		lineBaseTag: facts?.lineBaseTag?.name ?? null,
		from: release.from,
		bump: release.bump,
		releaseAs: release.releaseAs,
		propagatedFrom: [],
		absorbedFrom: [],
		next: release.next,
		version: kind === "prerelease" ? prerelease : null,
		sha: entry.head,
		changes: planChanges(facts, release),
	};
};

export interface PlanChange {
	/** Absent for file-based changes. */
	sha?: string;
	type: string;
	breaking: boolean;
	scope?: string;
	subject: string;
	pr?: number;
	/** Absorbed unit the change came through. */
	via?: string;
	/** Release-As value of this commit for the unit. */
	releaseAs?: string;
}

export interface UnitPlan {
	id: string;
	/** Unit root, `.` for the repo root. */
	path: string;
	plugin: string;
	scheme: string;
	tags: string[];
	group: string | null;
	affected: { reason: AffectedReason; via: string[] } | null;
	kind: "prerelease" | "rebuild" | "none";
	baseTag: string | null;
	lineBaseTag: string | null;
	/** Null on a first release. */
	from: string | null;
	bump: BumpLevel | null;
	releaseAs: string | null;
	propagatedFrom: string[];
	absorbedFrom: string[];
	next: string | null;
	version: string | null;
	/** The planned commit. */
	sha: string;
	/** Core commit order. */
	changes: PlanChange[];
}

export interface GroupPlan {
	name: string;
	members: string[];
	baseTag: string | null;
	from: string | null;
	bump: BumpLevel | null;
	next: string | null;
	version: string | null;
}

export interface ReleasedUnit {
	id: string;
	path: string;
	version: string;
	tag: string;
	floatingTags: string[];
	releaseSha: string;
	catchUp: boolean;
	pr: number | null;
	line: "default" | "maintenance";
}

/** `tallyrelease plan --json`, schema 1. */
export interface Plan extends Omit<AffectedDoc, "units"> {
	line: Line | null;
	/** Topological order, cycles by id. */
	units: UnitPlan[];
	/** Sorted by name. */
	groups: GroupPlan[];
	/** Stable releases in `(build.base, head]`; empty until filled. */
	released: ReleasedUnit[];
}

export interface PlanOptions extends AffectedOptions {
	/** Files at `head`, for intent source contexts. */
	fs: ReadonlyFs;
	/** Also list released units outside the build set with a pending release. */
	all?: boolean;
	debug?: (message: string) => void;
}

/** Inputs of `resolvePlan`, all collected before release math. */
export interface ResolveInput {
	affected: AffectedDoc;
	facts: PlanFacts;
	schemes: ReadonlyMap<string, VersionScheme<any>>;
	all: boolean;
}

/** Release math over collected facts; no I/O. */
export const resolvePlan = (
	workspace: Workspace,
	input: ResolveInput,
): Plan => {
	const { affected, facts, schemes } = input;
	const { units: _, ...doc } = affected;
	const line = matchBranch(workspace.release.branches, affected.branch);
	const warnings = [
		...affected.warnings,
		...lineWarnings(workspace, affected.branch, line),
		...facts.warnings,
		...releaseAsWarnings(workspace.units, facts.ranges),
	];

	const rank = new Map(workspace.graph.order.map((id, i) => [id, i]));
	const ordered = [...workspace.units].sort(
		(a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0),
	);
	const hits = new Map(affected.units.map((u) => [u.id, u]));
	const factsById = new Map(facts.units.map((f) => [f.id, f]));
	const units: UnitPlan[] = [];
	for (const unit of ordered) {
		const { id } = unit;
		const unitFacts = factsById.get(id);
		const scheme = schemes.get(unit.scheme);
		const range = facts.ranges.find((r) => r.from === unitFacts?.from);

		const release =
			unitFacts && scheme && range
				? releaseUnit(
						{
							unit,
							scheme,
							settings: workspace.release,
							facts: unitFacts,
							range,
							head: facts.head,
							channel: line?.channel ?? null,
						},
						warnings,
					)
				: undefined;
		const entry = unitPlan(
			{ unit, hit: hits.get(id), facts: unitFacts, release, head: facts.head },
			input.all,
		);
		if (entry) {
			units.push(entry);
		}
	}

	warnings.push(...noMatchingTag(workspace, facts));

	return { ...doc, line, units, groups: [], released: [], warnings };
};

/**
 * Plans `head`: validates release config, computes the build set, collects
 * git and intent facts and resolves versions and kinds.
 */
export const computePlan = async (
	workspace: Workspace,
	git: GitReader,
	opts: PlanOptions,
): Promise<Plan> => {
	const schemes = validateRelease(workspace);
	const affected = await computeAffected(workspace, git, opts);
	const facts = await collectPlanFacts(workspace, git, {
		head: opts.head,
		fs: opts.fs,
		...(opts.debug && { debug: opts.debug }),
	});

	return resolvePlan(workspace, {
		affected,
		facts,
		schemes,
		all: opts.all ?? false,
	});
};

export type { Line as PlanLine } from "./branches.js";
