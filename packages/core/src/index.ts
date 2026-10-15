export const version = "0.0.0";

export type {
	AffectedDoc,
	AffectedOptions,
	AffectedReason,
	AffectedUnit,
	BaseSource,
} from "./affected.js";
export type { DepConfig, TallyConfig, UnitOverlay } from "./config.js";
export type { Warning } from "./errors.js";
export type { Graph, SourcedEdge } from "./graph.js";
export type {
	BumpLevel,
	Change,
	Ctx,
	Edge,
	EdgeDraft,
	GitReader,
	IntentSource,
	MaybePromise,
	Plugin,
	PreCtx,
	Propagate,
	RawCommit,
	ReadonlyFs,
	TagRef,
	Unit,
	UnitDraft,
	VersionFile,
	VersionMode,
	VersionScheme,
	WriteCtx,
} from "./plugin.js";
export type { ActivePlugin, PluginEnv } from "./plugins.js";
export type { Workspace, WorkspaceInput } from "./workspace.js";

export { computeAffected } from "./affected.js";
export { CONFIG_FILE } from "./config.js";
export { discoverUnits } from "./discover.js";
export { TallyError } from "./errors.js";
export { buildGraph } from "./graph.js";
export { definePlugin, defaultUnitId, PLUGIN_API_VERSION } from "./plugin.js";
export { activatePlugins } from "./plugins.js";
export { loadWorkspace } from "./workspace.js";
