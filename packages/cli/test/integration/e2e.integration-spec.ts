import { afterAll, describe, expect, it } from "vitest";

import { createRepo, git, removeTmpDirs } from "./harness/git-repo.js";
import { runCli } from "./harness/run-cli.js";
import { affectedDocSchema } from "../../src/affected-schema.js";

import type { Dag } from "@tallyrelease/core/testing";

const json = (value: unknown) => JSON.stringify(value);

/** Affected `[id, reason]` pairs at HEAD for `--base <sha>`. */
const affectedAt = async (cwd: string, base: string) => {
	const result = await runCli(["affected", "--json", "--base", base], { cwd });
	expect(result).toMatchObject({ code: 0 });

	return affectedDocSchema
		.parse(JSON.parse(result.stdout))
		.units.map((u) => [u.path, u.reason]);
};

afterAll(removeTmpDirs);

describe("e2e", () => {
	it("yarn monorepo (G10)", async () => {
		const dag: Dag = {
			commits: [
				{
					id: "c0",
					files: {
						"tallyrelease.yaml": "plugins:\n  node: {}\n",
						"package.json": json({
							private: true,
							workspaces: ["packages/*", "apps/*"],
						}),
						"yarn.lock": "0",
						"README.md": "0",
						"packages/ui/package.json": json({ name: "@acme/ui" }),
						"packages/ui/src/button.ts": "0",
						"apps/web/package.json": json({
							name: "@acme/web",
							dependencies: { "@acme/ui": "workspace:^" },
						}),
						"apps/api/package.json": json({ name: "@acme/api" }),
						"apps/api/src/main.ts": "0",
					},
				},
				{ id: "c1", files: { "yarn.lock": "1" } },
				{ id: "c2", files: { "apps/api/src/main.ts": "2" } },
				{ id: "c3", files: { "packages/ui/src/button.ts": "3" } },
				{ id: "c4", files: { "README.md": "4" } },
			],
		};
		const { dir, sha } = createRepo(dag);

		expect(await affectedAt(dir, sha("c3"))).toEqual([]);
		expect(await affectedAt(dir, sha("c2"))).toEqual([
			["packages/ui", "direct"],
			["apps/web", "dependent"],
		]);
		expect(await affectedAt(dir, sha("c1"))).toEqual([
			["apps/api", "direct"],
			["packages/ui", "direct"],
			["apps/web", "dependent"],
		]);
		expect(await affectedAt(dir, sha("c0"))).toEqual([
			["apps/api", "global"],
			["packages/ui", "global"],
			["apps/web", "global"],
		]);

		const graph = await runCli(["graph", "--json"], { cwd: dir });
		expect(JSON.parse(graph.stdout)).toMatchObject({
			edges: [{ from: "ui", to: "web", pinned: false }],
		});
	});

	it("php single repo (G11)", async () => {
		const { dir, sha } = createRepo(
			{
				commits: [
					{
						id: "c0",
						files: {
							"tallyrelease.yaml": "plugins:\n  php: {}\n",
							"composer.json": json({ name: "acme/php-app" }),
							"composer.lock": "0",
							"src/App.php": "0",
						},
					},
					{ id: "c1", files: { "composer.lock": "1" } },
					{ id: "c2", files: { "src/App.php": "2" } },
				],
			},
			"php-app",
		);

		expect(await affectedAt(dir, sha("c1"))).toEqual([[".", "direct"]]);
		expect(await affectedAt(dir, sha("c0"))).toEqual([[".", "global"]]);

		const check = await runCli(["graph"], { cwd: dir });
		expect(check.stdout).toBe("php-app\t.\tphp\n");

		git(dir, "remote", "add", "origin", "git@github.com:acme/widgets.git");
		const named = await runCli(["graph"], { cwd: dir });
		expect(named.stdout).toBe("widgets\t.\tphp\n");
	});

	it("rejects --cwd below the repository root", async () => {
		const { dir } = createRepo({
			commits: [
				{
					id: "c0",
					files: { "tallyrelease.yaml": "plugins: {}\n", "sub/x": "0" },
				},
			],
		});

		const result = await runCli(["check", "--cwd", "sub"], { cwd: dir });
		expect(result.code).toBe(1);
		expect(result.stderr).toMatch(/^E_NOT_REPO_ROOT: /);
	});
});
