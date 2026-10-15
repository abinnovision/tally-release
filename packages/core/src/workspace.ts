import { CONFIG_FILE } from "./config.js";
import { discoverUnits } from "./discover.js";
import { buildGraph } from "./graph.js";
import { activatePlugins, runHook } from "./plugins.js";
import { uniqueSorted } from "./util.js";

import type { TallyConfig } from "./config.js";
import type { Warning } from "./errors.js";
import type { Graph, SourcedEdge } from "./graph.js";
import type { Unit } from "./plugin.js";
import type { ActivePlugin, PluginEnv } from "./plugins.js";

const collectEdges = async (
	active: readonly ActivePlugin[],
	config: TallyConfig,
	units: readonly Unit[],
): Promise<SourcedEdge[]> => {
	const edges: SourcedEdge[] = [];
	const frozen = Object.freeze([...units]);
	for (const { plugin, ctx } of active) {
		const hook = plugin.edges?.bind(plugin);
		if (!hook) {
			continue;
		}

		// eslint-disable-next-line no-await-in-loop -- hooks run sequentially in config order
		const drafts = await runHook(plugin.name, "edges", () => hook(ctx, frozen));
		edges.push(...drafts.map((d) => ({ ...d, source: plugin.name })));
	}

	for (const { from, to, pinned, reason } of config.deps ?? []) {
		edges.push({
			from,
			to,
			pinned: pinned ?? false,
			reason: reason ?? "config",
			source: "config",
		});
	}

	return edges;
};

const collectGlobalInputs = async (
	active: readonly ActivePlugin[],
	config: TallyConfig,
	configFile: string,
): Promise<string[]> => {
	const globs = [configFile, ...(config.globalInputs ?? [])];
	for (const { plugin, ctx, globalInputs } of active) {
		const hook = plugin.inputs?.bind(plugin);
		if (!hook || !globalInputs) {
			continue;
		}

		// eslint-disable-next-line no-await-in-loop -- hooks run sequentially in config order
		const inputs = await runHook(plugin.name, "inputs", () => hook(ctx));
		globs.push(...(inputs.global ?? []));
	}

	return uniqueSorted(globs);
};

export interface WorkspaceInput extends PluginEnv {
	/** Repo-relative config file path, a global input; defaults to `CONFIG_FILE`. */
	configFile?: string;
}

/** Units, graph and path rules of a repo at one commit. */
export interface Workspace {
	readonly repo: string;
	/** Sorted by id. */
	readonly units: readonly Unit[];
	readonly graph: Graph;
	/** Sorted globs. */
	readonly globalInputs: readonly string[];
	readonly ignore: readonly string[];
	readonly warnings: readonly Warning[];
}

/** Runs plugin hooks sequentially in config order and builds the graph. */
export const loadWorkspace = async (
	input: WorkspaceInput,
): Promise<Workspace> => {
	const warnings: Warning[] = [];
	const active = await activatePlugins(input, warnings);
	const units = await discoverUnits(active, input);
	const graph = buildGraph(
		units,
		await collectEdges(active, input.config, units),
	);
	const globalInputs = await collectGlobalInputs(
		active,
		input.config,
		input.configFile ?? CONFIG_FILE,
	);

	return {
		repo: input.repo.name,
		units,
		graph,
		globalInputs,
		ignore: input.config.ignore ?? [],
		warnings: [...warnings, ...graph.warnings],
	};
};
