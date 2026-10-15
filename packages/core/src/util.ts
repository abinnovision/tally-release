import type { BumpLevel } from "./plugin.js";

const LEVELS: readonly BumpLevel[] = ["patch", "minor", "major"];

/** Code-unit string order, independent of locale. */
export const compare = (a: string, b: string): number =>
	a < b ? -1 : a > b ? 1 : 0;

/** Sorted distinct values. */
export const uniqueSorted = (values: Iterable<string>): string[] =>
	[...new Set(values)].sort(compare);

/** The higher of two levels; null is lowest. */
export const maxLevel = (
	a: BumpLevel | null,
	b: BumpLevel | null,
): BumpLevel | null =>
	a === null || (b !== null && LEVELS.indexOf(b) > LEVELS.indexOf(a)) ? b : a;
