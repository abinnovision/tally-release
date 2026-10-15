import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createRepo, git, removeTmpDirs, tmpDir } from "./harness/git-repo.js";
import { runCli } from "./harness/run-cli.js";

import type { Repo } from "./harness/git-repo.js";

describe("shallow clone", () => {
	let repo: Repo;
	let clone: string;
	let worktree: string;

	beforeAll(() => {
		repo = createRepo({
			commits: [
				{
					id: "c0",
					files: { "tallyrelease.yaml": "units:\n  a: {}\n", "a/x": "0" },
				},
				{ id: "c1", files: { "a/x": "1" } },
				{ id: "c2", files: { "a/x": "2" } },
			],
		});
		clone = tmpDir("clone");
		git(clone, "clone", "--quiet", "--depth=1", `file://${repo.dir}`, ".");
		worktree = join(tmpDir("worktrees"), "wt");
		git(clone, "worktree", "add", "--quiet", "--detach", worktree);
	});

	afterAll(removeTmpDirs);

	it("errors on a base missing from a shallow clone (G07)", async () => {
		for (const cwd of [clone, worktree]) {
			// eslint-disable-next-line no-await-in-loop -- sequential cases
			const flag = await runCli(["affected", "--base", repo.sha("c0")], {
				cwd,
			});
			expect(flag.code).toBe(1);
			expect(flag.stderr).toMatch(/^E_SHALLOW_BASE: /);

			// eslint-disable-next-line no-await-in-loop -- sequential cases
			const pushed = await runCli(["affected"], {
				cwd,
				event: { name: "push", payload: { before: repo.sha("c1") } },
			});
			expect(pushed.code).toBe(1);
			expect(pushed.stderr).toMatch(/^E_SHALLOW_BASE: /);
		}
	});

	it("errors on a base present without common history (G07)", async () => {
		const shallow = tmpDir("shallow");
		git(shallow, "clone", "--quiet", "--depth=1", `file://${repo.dir}`, ".");
		git(repo.dir, "branch", "old", repo.sha("c0"));
		git(shallow, "fetch", "--quiet", "--depth=1", "origin", "old");

		const pushed = await runCli(["affected"], {
			cwd: shallow,
			event: { name: "push", payload: { before: repo.sha("c0") } },
		});
		expect(pushed.code).toBe(1);
		expect(pushed.stderr).toMatch(/^E_SHALLOW_BASE: .*no history in common/);

		const pr = await runCli(["affected"], {
			cwd: shallow,
			event: {
				name: "pull_request",
				payload: { pull_request: { base: { sha: repo.sha("c0") } } },
			},
		});
		expect(pr.code).toBe(1);
		expect(pr.stderr).toMatch(/^E_SHALLOW_BASE: .*no history in common/);
	});

	it("resolves bases present in the shallow clone", async () => {
		const result = await runCli(["affected", "--json", "--base", "HEAD"], {
			cwd: worktree,
		});
		expect(result).toMatchObject({ code: 0 });
		expect(JSON.parse(result.stdout)).toMatchObject({
			head: repo.sha("c2"),
			build: { base: repo.sha("c2"), baseSource: "cli" },
			units: [],
		});
	});
});
