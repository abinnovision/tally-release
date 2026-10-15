import { attribution, matcher } from "./attribution.js";
import { TallyError } from "./errors.js";
import { planWithFacts } from "./plan.js";

import type { Warning } from "./errors.js";
import type { Plan, PlanChange, PlanOptions, UnitPlan } from "./plan.js";
import type { GitReader } from "./plugin.js";
import type { Workspace } from "./workspace.js";

export interface ExplainedChange extends PlanChange {
	/** Commit files attributed to the unit, or to `via`. */
	files: string[];
}

export interface ReleaseAsFooter {
	sha?: string;
	/** Raw value; qualified values without the unit prefix. */
	version: string;
	qualified: boolean;
	/** The value that set `releaseAs`. */
	applied: boolean;
}

/** Why a unit is affected and how its version is computed. */
export interface UnitExplanation {
	/** The plan with `all` set. */
	plan: Plan;
	/** Plan entry; null when the unit is neither affected nor pending. */
	unit: UnitPlan | null;
	/** Changed unit files (reason `direct`) or changed global inputs (`global`). */
	files: string[];
	/** Plan changes with their files, core commit order. */
	changes: ExplainedChange[];
	/** `pinned` is null when the dependency is reached through unreleased units. */
	propagatedFrom: { id: string; pinned: boolean | null }[];
	/** Release-As footers for the unit since its base tag, core commit order. */
	releaseAs: ReleaseAsFooter[];
	/** Plan warnings of the unit and those of no unit. */
	warnings: Warning[];
}

export interface ExplainOptions extends PlanOptions {
	/** Unit id. */
	unit: string;
}

/** Explains one unit of the plan of `opts.head`; throws `E_UNIT_UNKNOWN`. */
export const explainUnit = async (
	workspace: Workspace,
	git: GitReader,
	{ unit: id, ...opts }: ExplainOptions,
): Promise<UnitExplanation> => {
	if (!workspace.units.some((u) => u.id === id)) {
		throw new TallyError("E_UNIT_UNKNOWN", `unknown unit "${id}"`, {
			unit: id,
		});
	}

	const { plan, facts, releases } = await planWithFacts(workspace, git, {
		...opts,
		all: true,
	});
	const unit = plan.units.find((u) => u.id === id) ?? null;
	const ignored = matcher(workspace.ignore);
	const isGlobal = matcher(workspace.globalInputs);
	const owners = attribution(workspace.units);
	const owned = (files: readonly string[], owner: string) =>
		files.filter(
			(f) => !ignored(f) && !isGlobal(f) && owners(f).includes(owner),
		);

	const { base } = plan.build;
	const reason = unit?.affected?.reason;
	const files =
		reason === "global"
			? plan.build.globalInputs
			: reason === "direct" && base !== null
				? owned(await git.diffFiles(base, opts.head), id)
				: [];

	const unitFacts = facts.units.find((f) => f.id === id);
	const commitFiles = new Map(
		unitFacts
			? (await git.log(unitFacts.from, opts.head)).map((c) => [c.sha, c.files])
			: [],
	);
	const changes = (unit?.changes ?? []).map((c) => ({
		...c,
		files: owned(commitFiles.get(c.sha ?? "") ?? [], c.via ?? id),
	}));

	const propagatedFrom = (unit?.propagatedFrom ?? []).map((from) => ({
		id: from,
		pinned:
			workspace.graph.edges.find((e) => e.from === from && e.to === id)
				?.pinned ?? null,
	}));

	const range = facts.ranges.find((r) => r.from === unitFacts?.from);
	const footers = (unitFacts ? (range?.changes ?? []) : []).flatMap(
		({ change, units }) =>
			(change.releaseAs ?? [])
				.filter(
					(r) => r.unit === id || (r.unit === undefined && units.includes(id)),
				)
				.map((r) => ({
					...(change.sha === undefined ? {} : { sha: change.sha }),
					version: r.version,
					qualified: r.unit !== undefined,
				})),
	);
	const winner = releases.get(id)?.releaseAsFooter;
	const applied = footers.findIndex(
		(f) => winner && f.sha === winner.sha && f.version === winner.raw,
	);

	return {
		plan,
		unit,
		files,
		changes,
		propagatedFrom,
		releaseAs: footers.map((f, i) => ({ ...f, applied: i === applied })),
		warnings: plan.warnings.filter(
			(w) => w.unit === id || w.unit === undefined,
		),
	};
};
