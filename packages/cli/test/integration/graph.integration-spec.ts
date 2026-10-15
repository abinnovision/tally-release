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
		expect(result.stderr).toContain("W_CYCLE");
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
