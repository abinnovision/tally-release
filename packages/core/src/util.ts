/** Code-unit string order, independent of locale. */
export const compare = (a: string, b: string): number =>
	a < b ? -1 : a > b ? 1 : 0;

/** Sorted distinct values. */
export const uniqueSorted = (values: Iterable<string>): string[] =>
	[...new Set(values)].sort(compare);
