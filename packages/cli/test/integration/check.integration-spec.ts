import { memoryFs } from "@tallyrelease/core/testing";
import { describe, expect, it } from "vitest";

import { runCli } from "./harness/run-cli.js";

const check = (files: Record<string, string>, ...args: string[]) =>
	runCli(["check", ...args], { fs: memoryFs(files) });

describe("check", () => {
	it("reports errors with exit code 1 (G12)", async () => {
		const ok = await check({
			"tallyrelease.yaml":
				"units:\n  a: {}\n  b: {}\ndeps:\n  - { from: a, to: b }\n",
			"a/x": "",
			"b/x": "",
		});
		expect(ok).toEqual({
			code: 0,
			stdout: "ok: 2 units, 1 edges\n",
			stderr: "",
		});

		const cases: [Record<string, string>, string][] = [
			[{}, "E_CONFIG_MISSING"],
			[{ "tallyrelease.yaml": "plugins: [" }, "E_CONFIG"],
			[{ "tallyrelease.yaml": "plugins: {}\nbranches: []\n" }, "E_CONFIG"],
			[{ "tallyrelease.yaml": "plugins: { nope: {} }\n" }, "E_PLUGIN_UNKNOWN"],
			[
				{
					"tallyrelease.yaml":
						"units:\n  a: {}\ndeps:\n  - { from: a, to: b }\n",
					"a/x": "",
				},
				"E_EDGE_UNKNOWN_UNIT",
			],
		];
		for (const [files, code] of cases) {
			// eslint-disable-next-line no-await-in-loop -- sequential cases
			const result = await check(files);
			expect(result.code).toBe(1);
			expect(result.stderr).toMatch(new RegExp(`^${code}: `));
		}
	});

	it("reads --config relative to --cwd", async () => {
		const result = await runCli(
			["check", "--cwd", "sub", "--config", "conf/t.yaml"],
			{ fs: memoryFs({ "conf/t.yaml": "plugins: {}\n" }) },
		);
		expect(result).toMatchObject({ code: 0, stdout: "ok: 0 units, 0 edges\n" });
	});
});
