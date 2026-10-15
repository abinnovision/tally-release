import { afterAll, describe, expect, it } from "vitest";

import { fakeForge } from "./harness/fake-forge.js";
import { removeTmpDirs } from "./harness/git-repo.js";
import { memoryRepo } from "./harness/memory-repo.js";
import { actionsEnv, runCli } from "./harness/run-cli.js";

import type { RunOptions } from "./harness/run-cli.js";
import type { Dag } from "@tallyrelease/core/testing";

const config = `
plugins: {}
globalInputs: [yarn.lock]
units:
  libs/ui: { id: ui, release: true }
  apps/web: { id: web }
  apps/api: { id: api }
deps:
  - { from: ui, to: web }
`;

/** p1 changes a global input, p2 ui and two loose files, p3 api and one. */
const dag: Dag = {
	commits: [
		{
			id: "p0",
			files: {
				"tallyrelease.yaml": config,
				"yarn.lock": "0",
				"README.md": "0",
				LICENSE: "0",
				"libs/ui/a.ts": "0",
				"apps/web/a.ts": "0",
				"apps/api/a.ts": "0",
			},
		},
		{ id: "p1", files: { "yarn.lock": "1" } },
		{
			id: "p2",
			files: { "libs/ui/a.ts": "2", "README.md": "2", LICENSE: "2" },
		},
		{ id: "p3", files: { "apps/api/a.ts": "3", "README.md": "3" } },
	],
};

const affected = (args: string[], opts: RunOptions = {}) =>
	runCli(["affected", ...args], { ...memoryRepo(dag), ...opts });

afterAll(removeTmpDirs);

describe("affected text and tsv (G28)", () => {
	it("groups units by reason", async () => {
		const result = await affected(["--base", "p1"]);
		expect(result).toEqual({
			code: 0,
			stdout: [
				"base  p1 (--base p1)",
				"",
				"direct (2)",
				"  api  apps/api",
				"  ui   libs/ui           released",
				"dependent (1)",
				"  web  apps/web  via ui",
				"",
				"3 of 3 units affected, 2 files outside any unit",
				"",
			].join("\n"),
			stderr: "",
		});

		expect((await affected(["--base", "p0"])).stdout).toContain(
			[
				"global (3)",
				"  changed: yarn.lock",
				"  api  apps/api",
				"  ui   libs/ui   released",
				"  web  apps/web",
				"",
			].join("\n"),
		);
		expect((await affected(["--base", "p2"])).stdout).toMatch(
			/\n1 of 3 units affected, 1 file outside any unit\n$/,
		);
		expect((await affected(["--base", "p3"])).stdout).toBe(
			"base  p3 (--base p3)\n\nno units affected\n",
		);
		expect((await affected([])).stdout).toMatch(
			/^base {2}none \(everything is affected\)\n\nall \(3\)\n/,
		);
	});

	it("labels every base source", async () => {
		const token = { ...actionsEnv, GITHUB_TOKEN: "t" };
		const cases: [RunOptions, string][] = [
			[
				{ event: { name: "push", payload: { before: "p2" } } },
				"p2 (push before)",
			],
			[
				{
					event: { name: "push", payload: { before: "p2" } },
					env: token,
					forge: fakeForge(["p1"]),
				},
				"p1 (last successful run)",
			],
			[
				{
					event: {
						name: "pull_request",
						payload: { pull_request: { base: { sha: "p1" } } },
					},
				},
				"p1 (merge base with the PR target)",
			],
			[
				{
					event: {
						name: "merge_group",
						payload: { merge_group: { base_sha: "p2" } },
					},
				},
				"p2 (merge group base)",
			],
		];
		for (const [opts, label] of cases) {
			// eslint-disable-next-line no-await-in-loop -- sequential cases
			const result = await affected([], { env: actionsEnv, ...opts });
			expect(result.stdout.split("\n")[0]).toBe(`base  ${label}`);
		}
	});

	it("prints tsv", async () => {
		expect(await affected(["--format", "tsv", "--base", "p1"])).toEqual({
			code: 0,
			stdout: [
				"id\tpath\treason\tvia\treleased\ttags",
				"api\tapps/api\tdirect\t\tfalse\t",
				"ui\tlibs/ui\tdirect\t\ttrue\t",
				"web\tapps/web\tdependent\tui\tfalse\t",
				"",
			].join("\n"),
			stderr: "",
		});

		const conflict = await affected(["--json", "--format", "tsv"]);
		expect(conflict.code).toBe(2);
		expect(conflict.stderr).toContain("cannot be combined");
	});
});
