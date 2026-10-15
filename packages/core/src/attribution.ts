import picomatch from "picomatch/posix.js";

import type { Unit } from "./plugin.js";

export type PathMatcher = (path: string) => boolean;

/** Matches any of `patterns`; an empty list matches nothing. */
export const matcher = (patterns: readonly string[]): PathMatcher =>
	patterns.length === 0 ? () => false : picomatch([...patterns], { dot: true });

/** Returns the ids of units owning a path: `include` matches, `exclude` does not. */
export const attribution = (
	units: readonly Unit[],
): ((path: string) => string[]) => {
	const owners = units.map((u) => ({
		id: u.id,
		include: matcher(u.include),
		exclude: matcher(u.exclude),
	}));

	return (path) =>
		owners.filter((o) => o.include(path) && !o.exclude(path)).map((o) => o.id);
};
