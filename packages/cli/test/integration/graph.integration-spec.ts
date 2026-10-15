import { memoryFs } from "@tallyrelease/core/testing";
import { describe, expect, it } from "vitest";

import { runCli } from "./harness/run-cli.js";

const graph = (files: Record<string, string>, ...args: string[]) =>
	runCli(["graph", ...args], { fs: memoryFs(files) });

const files = {
	"tallyrelease.yaml":
		"units:\n  a: { release: true }\n  b: {}\ndeps:\n  - { from: a, to: b }\n  - { from: b, to: a }\n",
	"a/x": "",
	"b/x": "",
};

describe("graph", () => {
	it("prints mermaid on stdout and warnings on stderr (G19)", async () => {
		const result = await graph(files, "--format", "mermaid");
		expect(result.code).toBe(0);
		expect(result.stdout).toBe(
			[
				"flowchart LR",
				'  u0["a"]:::released',
				'  u1["b"]',
				"  u0 -.-> u1",
				"  u1 -.-> u0",
				"  classDef released stroke:#333,stroke-width:3px",
				"",
			].join("\n"),
		);
		expect(result.stderr).toBe(
			"warning[W_CYCLE]: dependency cycle: a -> b -> a\n",
		);
	});

	it("prints a table and the dependents tree as text (G19)", async () => {
		const cycle = await graph(files);
		expect(cycle.stdout).toBe(
			[
				"UNIT  PATH  PLUGIN  RELEASE",
				"a     a     config  tag",
				"b     b     config  -",
				"",
				"dependents",
				"a",
				"└── b",
				"    └── a (cycle)",
				"",
				"2 units (1 released), 2 edges; (cycle) edge back into the current path",
				"",
			].join("\n"),
		);

		const dag = await graph({
			"tallyrelease.yaml":
				"units:\n  a: {}\n  b: {}\n  c: {}\n  d: {}\ndeps:\n  - { from: a, to: b }\n  - { from: a, to: c }\n  - { from: b, to: c }\n  - { from: c, to: d }\n",
			"a/x": "",
			"b/x": "",
			"c/x": "",
			"d/x": "",
		});
		expect(dag.stdout).toContain(
			[
				"dependents",
				"a",
				"├── b",
				"│   └── c",
				"│       └── d",
				"└── c (*)",
				"",
				"4 units (0 released), 4 edges; (*) expanded above",
				"",
			].join("\n"),
		);

		const single = await graph({
			"tallyrelease.yaml": "units:\n  a: {}\n",
			"a/x": "",
		});
		expect(single.stdout).toBe(
			[
				"UNIT  PATH  PLUGIN  RELEASE",
				"a     a     config  -",
				"",
				"1 unit (0 released), 0 edges",
				"",
			].join("\n"),
		);

		const empty = await graph({ "tallyrelease.yaml": "plugins: {}\n" });
		expect(empty).toEqual({ code: 0, stdout: "no units\n", stderr: "" });
	});

	it("--format json equals --json (G19)", async () => {
		const viaFormat = await graph(files, "--format", "json");
		const viaFlag = await graph(files, "--json");
		expect(viaFormat.code).toBe(0);
		expect(viaFormat).toEqual(viaFlag);
	});

	it("rejects unknown and conflicting formats (G19)", async () => {
		for (const args of [
			["--format", "dot"],
			["--json", "--format", "text"],
		]) {
			// eslint-disable-next-line no-await-in-loop -- sequential cases
			const result = await graph(files, ...args);
			expect(result.code).toBe(2);
			expect(result.stderr).not.toBe("");
		}
	});
});
