/** `1 unit`, `2 units`. */
export const count = (n: number, noun: string): string =>
	`${String(n)} ${noun}${n === 1 ? "" : "s"}`;
