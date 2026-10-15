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
});
