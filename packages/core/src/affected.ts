import { attribution, matcher } from "./attribution.js";
import { uniqueSorted } from "./util.js";

import type { Warning } from "./errors.js";
import type { GitReader } from "./plugin.js";
import type { Workspace } from "./workspace.js";

export type BaseSource =
	| "cli"
	| "push-before"
	| "pr-merge-base"
	| "merge-group"
	| "forge-last-success"
	| "local-merge-base"
	| "none";

export type AffectedReason = "direct" | "dependent" | "global" | "all";

export interface AffectedUnit {
	id: string;
	/** Unit root, `.` for the repo root. */
	path: string;
	plugin: string;
	reason: AffectedReason;
	/** Affected direct dependencies that made a dependent affected. */
	via: string[];
}

/** `tallyrelease affected --json`, schema 1. */
export interface AffectedDoc {
	schema: 1;
	tool: string;
	repo: string;
	branch: string;
	head: string;
	build: {
		base: string | null;
		baseSource: BaseSource;
		all: boolean;
		globalInputs: string[];
	};
	units: AffectedUnit[];
	unattributed: string[];
	warnings: Warning[];
}

export interface AffectedOptions {
	/** For example `tallyrelease@0.1.0`. */
	tool: string;
	branch: string;
	head: string;
	/** Null marks every unit affected without a diff. */
	base: string | null;
	baseSource: BaseSource;
}

/** Computes the build set for `base..head` from a tree-to-tree diff. */
export const computeAffected = async (
	workspace: Workspace,
	git: GitReader,
	opts: AffectedOptions,
): Promise<AffectedDoc> => {
	const { units, graph } = workspace;
	const doc = (
		affected: AffectedUnit[],
		build: { all: boolean; globalInputs: string[] },
		unattributed: string[],
	): AffectedDoc => ({
		schema: 1,
		tool: opts.tool,
		repo: workspace.repo,
		branch: opts.branch,
		head: opts.head,
		build: { base: opts.base, baseSource: opts.baseSource, ...build },
		units: affected,
		unattributed,
		warnings: [...workspace.warnings],
	});
	const everything = (reason: AffectedReason): AffectedUnit[] =>
		units.map((u) => ({
			id: u.id,
			path: u.root,
			plugin: u.plugin,
			reason,
			via: [],
		}));

	if (opts.base === null) {
		return doc(everything("all"), { all: true, globalInputs: [] }, []);
	}

	const ignored = matcher(workspace.ignore);
	const isGlobal = matcher(workspace.globalInputs);
	const owners = attribution(units);

	const files = (await git.diffFiles(opts.base, opts.head)).filter(
		(f) => !ignored(f),
	);
	const hits = uniqueSorted(files.filter(isGlobal));
	const direct = new Set<string>();
	const unattributed: string[] = [];
	for (const file of files) {
		if (isGlobal(file)) {
			continue;
		}

		const ids = owners(file);
		if (ids.length === 0) {
			unattributed.push(file);
		}

		for (const id of ids) {
			direct.add(id);
		}
	}

	if (hits.length > 0) {
		return doc(
			everything("global"),
			{ all: true, globalInputs: hits },
			uniqueSorted(unattributed),
		);
	}

	const affected = new Set(direct);
	const queue = [...direct];
	for (const id of queue) {
		for (const dependent of graph.dependents.get(id) ?? []) {
			if (!affected.has(dependent)) {
				affected.add(dependent);
				queue.push(dependent);
			}
		}
	}

	const result = units
		.filter((u) => affected.has(u.id))
		.map((u): AffectedUnit => {
			const isDirect = direct.has(u.id);

			return {
				id: u.id,
				path: u.root,
				plugin: u.plugin,
				reason: isDirect ? "direct" : "dependent",
				via: isDirect
					? []
					: (graph.dependencies.get(u.id) ?? []).filter((d) => affected.has(d)),
			};
		});

	return doc(
		result,
		{ all: false, globalInputs: [] },
		uniqueSorted(unattributed),
	);
};
