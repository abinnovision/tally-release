import type { Propagate, VersionSource } from "./plugin.js";

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
	defaults?: { release?: boolean; tagFormat?: string; propagate?: Propagate };
	/** Overlays keyed by unit root. */
	units?: Record<string, UnitOverlay>;
	deps?: DepConfig[];
	ignore?: string[];
	globalInputs?: string[];
}

/** Global input owned by core. */
export const CONFIG_FILE = "tallyrelease.yaml";
