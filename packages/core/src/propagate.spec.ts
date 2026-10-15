import { describe, expect, it } from "vitest";

import { propagate } from "./propagate.js";

const edge = (from: string, to: string) => ({
	from,
	to,
	reasons: ["dependencies"],
	pinned: true,
	sources: ["stub"],
});

describe("propagate", () => {
	it("terminates on a three-node pinned cycle", () => {
		const result = propagate(
			{
				edges: [edge("a", "b"), edge("b", "c"), edge("c", "a")],
				order: ["a", "b", "c"],
			},
			["a", "b", "c"].map((id) => ({ id, propagate: "auto" as const })),
			new Map([
				["a", { bump: "minor" as const, pending: true }],
				["b", { bump: null, pending: false }],
				["c", { bump: null, pending: false }],
			]),
		);

		expect(Object.fromEntries(result)).toEqual({
			a: { bump: "minor", pending: true, propagatedFrom: ["c"] },
			b: { bump: "patch", pending: true, propagatedFrom: ["a"] },
			c: { bump: "patch", pending: true, propagatedFrom: ["b"] },
		});
	});

	it("raises two groups that propagate into each other in a cycle", () => {
		const state = (group: string, bump: "minor" | null = null) => ({
			bump,
			pending: bump !== null,
			group,
		});
		const result = propagate(
			{ edges: [edge("b", "c"), edge("d", "a")], order: ["a", "b", "c", "d"] },
			["a", "b", "c", "d"].map((id) => ({ id, propagate: "auto" as const })),
			new Map([
				["a", state("g1", "minor")],
				["b", state("g1")],
				["c", state("g2")],
				["d", state("g2")],
			]),
		);

		expect(
			Object.fromEntries(
				[...result].map(([id, s]) => [id, [s.bump, s.propagatedFrom]]),
			),
		).toEqual({
			a: ["minor", ["d"]],
			b: ["minor", []],
			c: ["patch", ["b"]],
			d: ["patch", []],
		});
	});
});
