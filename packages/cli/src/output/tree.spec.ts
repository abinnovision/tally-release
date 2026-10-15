import { describe, expect, it } from "vitest";

import { renderTree } from "./tree.js";

const tree = (edges: Record<string, string[]>) =>
	renderTree(Object.keys(edges).sort(), (id) => edges[id] ?? []);

describe("renderTree", () => {
	it("marks DAG nodes expanded before with (*)", () => {
		expect(tree({ a: ["c"], b: ["c"], c: ["d"], d: [] })).toEqual({
			lines: ["a", "└── c", "    └── d", "b", "└── c (*)"],
			shared: true,
			cycle: false,
		});
	});

	it("repeats leaves without a marker", () => {
		expect(tree({ a: ["b", "c"], b: ["c"], c: [] })).toEqual({
			lines: ["a", "├── b", "│   └── c", "└── c"],
			shared: false,
			cycle: false,
		});
	});

	it("marks a cycle reached from a root", () => {
		expect(tree({ a: ["b"], b: ["c"], c: ["b"] })).toEqual({
			lines: ["a", "└── b", "    └── c", "        └── b (cycle)"],
			shared: false,
			cycle: true,
		});
	});

	it("renders a pure cycle from its smallest id", () => {
		expect(tree({ a: ["b"], b: ["a"], c: [] })).toEqual({
			lines: ["c", "a", "└── b", "    └── a (cycle)"],
			shared: false,
			cycle: true,
		});
	});

	it("renders a single unit and empty input", () => {
		expect(tree({ a: [] }).lines).toEqual(["a"]);
		expect(tree({}).lines).toEqual([]);
	});
});
