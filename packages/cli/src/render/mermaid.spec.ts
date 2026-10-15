import { describe, expect, it } from "vitest";

import { renderMermaid } from "./mermaid.js";

const unit = (id: string, version = "none") => ({ id, version });
const edge = (from: string, to: string, pinned = false) => ({
	from,
	to,
	pinned,
});

describe("renderMermaid", () => {
	it("draws pinned edges solid and unpinned edges dashed", () => {
		expect(
			renderMermaid(
				[unit("a"), unit("b"), unit("c")],
				[edge("a", "b", true), edge("b", "c")],
			),
		).toBe(
			[
				"flowchart LR",
				'  u0["a"]',
				'  u1["b"]',
				'  u2["c"]',
				"  u0 --> u1",
				"  u1 -.-> u2",
				"",
			].join("\n"),
		);
	});

	it("marks released units and emits the class definition", () => {
		expect(renderMermaid([unit("a", "1.0.0"), unit("b")], [])).toBe(
			[
				"flowchart LR",
				'  u0["a"]:::released',
				'  u1["b"]',
				"  classDef released stroke:#333,stroke-width:3px",
				"",
			].join("\n"),
		);
	});

	it("keeps unit ids in labels, not node ids", () => {
		expect(
			renderMermaid([unit("a.b"), unit("end")], [edge("a.b", "end")]),
		).toBe(
			["flowchart LR", '  u0["a.b"]', '  u1["end"]', "  u0 -.-> u1", ""].join(
				"\n",
			),
		);
	});

	it("renders an empty graph", () => {
		expect(renderMermaid([], [])).toBe("flowchart LR\n");
	});

	it("renders both edges of a cycle", () => {
		expect(
			renderMermaid([unit("a"), unit("b")], [edge("a", "b"), edge("b", "a")]),
		).toBe(
			[
				"flowchart LR",
				'  u0["a"]',
				'  u1["b"]',
				"  u0 -.-> u1",
				"  u1 -.-> u0",
				"",
			].join("\n"),
		);
	});
});
