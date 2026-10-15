import type { BumpLevel, Propagate, VersionSource } from "./plugin.js";

/** Config overlay for the unit at a root; creates a config-only unit if none is discovered. */
export interface UnitOverlay {
	id?: string;
	include?: string[];
	exclude?: string[];
	/** Default `defaults.release`, else false. */
	release?: boolean;
	/** Overrides the plugin's source; applies only when released. */
	version?: VersionSource;
	scheme?: string;
	tagFormat?: string;
	propagate?: Propagate;
	/** Labels for filtering, each matching `/^[A-Za-z0-9._-]+$/`. */
	tags?: string[];
	/** First release version, parsed by the unit's scheme. */
	initialVersion?: string;
}

/** A branch rule; the first rule whose `name` matches the branch wins. */
export interface BranchConfig {
	/** Pattern with `*`, `{major}` and `{minor}`. */
	name: string;
	line: "default" | "maintenance";
	/** Prerelease channel, may use the `{major}`/`{minor}` captures of `name`. */
	channel?: string;
}

export interface BumpsConfig {
	/** Commit type to level, merged over the defaults. */
	types?: Record<string, BumpLevel>;
	/** Levels used while the major version is 0. */
	preMajor?: { breaking?: BumpLevel; feat?: BumpLevel };
}

export interface DepConfig {
	from: string;
	to: string;
	pinned?: boolean;
	reason?: string;
}

/** Parsed `tallyrelease.yaml`, as passed by the cli. */
export interface TallyConfig {
	/**
	 * Enabled plugins in run order, mapped to their raw options. The core-owned
	 * key `globalInputs: false` disables that plugin's default global inputs.
	 */
	plugins: Record<string, Record<string, unknown> | null>;
	defaults?: {
		release?: boolean;
		tagFormat?: string;
		propagate?: Propagate;
		initialVersion?: string;
	};
	/** Overlays keyed by unit root. */
	units?: Record<string, UnitOverlay>;
	deps?: DepConfig[];
	ignore?: string[];
	globalInputs?: string[];
	branches?: BranchConfig[];
	bumps?: BumpsConfig;
}

/** Global input owned by core. */
export const CONFIG_FILE = "tallyrelease.yaml";
