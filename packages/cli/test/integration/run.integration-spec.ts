import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

import {
	fakeForge,
	fakeGitWriter,
	memoryRemote,
	mergePr,
} from "./harness/fake-forge.js";
import { removeTmpDirs, tmpDir } from "./harness/git-repo.js";
import { memoryRepo } from "./harness/memory-repo.js";
import { actionsEnv, runCli } from "./harness/run-cli.js";
import { planSchema } from "../../src/plan-schema.js";

import type { RunOptions } from "./harness/run-cli.js";
import type { Dag } from "@tallyrelease/core/testing";

afterAll(removeTmpDirs);

const json = (o: unknown) => `${JSON.stringify(o, null, 2)}\n`;

const env = {
	...actionsEnv,
	GITHUB_TOKEN: "t",
	GITHUB_SERVER_URL: "https://github.com",
};

const config = `
plugins: { node: {} }
defaults: { release: true }
branches:
  - { name: main, line: default }
# Warns W_GROUP_EMPTY in every plan.
groups:
  empty: { tags: [none] }
`;

/** Units a and b at 1.0.0 (tagged at c0), one feat on each. */
const dag: Dag = {
	commits: [
		{
			id: "c0",
			files: {
				"tallyrelease.yaml": config,
				"package.json": json({ workspaces: ["packages/*"] }),
				"packages/a/package.json": json({ name: "@s/a", version: "1.0.0" }),
				"packages/b/package.json": json({ name: "@s/b", version: "1.0.0" }),
			},
		},
		{ id: "c1", message: "feat(a): add a", files: { "packages/a/x.ts": "1" } },
		{ id: "c2", message: "feat(b): add b", files: { "packages/b/x.ts": "1" } },
	],
	tags: [
		{ name: "a-v1.0.0", commit: "c0" },
		{ name: "b-v1.0.0", commit: "c0" },
	],
};

const commit = (before: Dag, id: string): Dag => ({
	...before,
	commits: [
		...before.commits,
		{ id, message: `chore: ${id}`, files: { "README.md": id } },
	],
});

const tip = (d: Dag) => d.commits.at(-1)?.id ?? "";

const push = (before: string) => ({ name: "push", payload: { before } });

/**
 * Remote with `main` at the dag's HEAD and a release PR for a and b opened by
 * `pr`; `runs` are the head shas of successful runs, newest first.
 */
const setup = async () => {
	const remote = memoryRemote();
	remote.branches.set("main", tip(dag));
	const runs: string[] = [];
	const forge = fakeForge(runs, remote);
	const cli = async (args: string[], runDag: Dag, opts: RunOptions = {}) => {
		const gitWriter = fakeGitWriter(remote);

		return await runCli(args, {
			...memoryRepo(runDag, [remote.tags, gitWriter.tags]),
			forge,
			gitWriter,
			clock: () => new Date("2026-10-15T12:00:00Z"),
			...opts,
			env: { ...env, ...opts.env },
		});
	};

	await cli(["pr"], dag);

	const merge = (before: Dag): Dag => {
		const merged = mergePr(before, remote, 1);
		remote.branches.set("main", tip(merged));

		return merged;
	};

	/** `run --out` at `runDag`: the result and the plan file. */
	const run = async (runDag: Dag, args: string[], opts: RunOptions = {}) => {
		const out = join(tmpDir("run"), "plan.json");
		const result = await cli(["run", "--out", out, ...args], runDag, opts);

		return {
			...result,
			plan:
				result.code === 0
					? planSchema.parse(JSON.parse(readFileSync(out, "utf8")))
					: undefined,
		};
	};

	/** Runs `run` twice; the second run writes nothing to the remote or forge. */
	const twice = async (runDag: Dag, args: string[], opts: RunOptions = {}) => {
		const first = await run(runDag, args, opts);
		const calls = remote.calls.length;
		const second = await run(runDag, args, opts);
		expect(remote.calls).toHaveLength(calls);

		return [first, second] as const;
	};

	return { remote, runs, cli, merge, run, twice };
};

describe("run", () => {
	it("lists the tags it reconciled in released and as base tags (E14, E23, E26)", async () => {
		const { remote, runs, merge, twice } = await setup();
		runs.push("c2");
		const merged = merge(dag);
		remote.calls.length = 0;

		const [first, second] = await twice(merged, [], { event: push("c2") });
		// Plan warnings repeated by the pr step print once.
		expect(first).toMatchObject({
			code: 0,
			stderr: 'warning[W_GROUP_EMPTY]: group "empty" selects no unit\n',
		});
		expect(first.stdout).toMatch(
			/^PR #1: tagged a-v1\.1\.0, b-v1\.1\.0 at merge-1\nPR #1: created releases a-v1\.1\.0, b-v1\.1\.0\nPR #1: labelled released\nno release PRs\n/u,
		);
		expect(remote.tags).toEqual(
			new Map([
				["a-v1.1.0", "merge-1"],
				["b-v1.1.0", "merge-1"],
			]),
		);
		const released = [
			{ id: "a", tag: "a-v1.1.0", releaseSha: "merge-1", catchUp: false },
			{ id: "b", tag: "b-v1.1.0", releaseSha: "merge-1", catchUp: false },
		].map((r) => ({ ...r, pr: 1 }));
		expect(first.plan?.released).toMatchObject(released);
		expect(first.plan?.units.map((u) => [u.id, u.baseTag])).toEqual([
			["a", "a-v1.1.0"],
			["b", "b-v1.1.0"],
		]);

		// Re-run on the same sha: reconcile is a no-op, the PR comes from the forge.
		expect(second.stdout).toMatch(/^no merged release PRs\nno release PRs\n/u);
		expect(second.plan?.released).toMatchObject(released);
	});

	it("lists a release tagged by a later push run as a catch-up (E09)", async () => {
		const { runs, merge, twice } = await setup();
		runs.push("c2");
		const later = commit(merge(dag), "c4");

		const [first] = await twice(later, [], { event: push("merge-1") });
		expect(first.stdout).toContain(
			"PR #1: tagged a-v1.1.0, b-v1.1.0 at merge-1",
		);
		expect(first.plan?.released).toMatchObject([
			{ tag: "a-v1.1.0", releaseSha: "merge-1", catchUp: true, pr: 1 },
			{ tag: "b-v1.1.0", releaseSha: "merge-1", catchUp: true, pr: 1 },
		]);
	});

	it("emits a release again until a run succeeds (E16)", async () => {
		const { runs, merge, run } = await setup();
		runs.push("c2");
		const merged = merge(dag);
		await run(merged, [], { event: push("c2") });
		const later = commit(merged, "c4");

		// The run at merge-1 failed to publish: the last success is still c2.
		const failed = await run(later, [], { event: push("merge-1") });
		expect(failed.plan?.released).toMatchObject([
			{ tag: "a-v1.1.0", catchUp: true, pr: 1 },
			{ tag: "b-v1.1.0", catchUp: true, pr: 1 },
		]);

		runs.unshift("merge-1");
		const succeeded = await run(later, [], { event: push("merge-1") });
		expect(succeeded.plan?.released).toEqual([]);
	});

	it("fails on a forge error before any effect, else lists only this run's releases without a base (E34)", async () => {
		const { remote, cli, merge, twice } = await setup();
		const later = commit(merge(dag), "c4");
		const dispatch = { name: "workflow_dispatch", payload: {} };
		remote.calls.length = 0;

		const failing = {
			...fakeForge([], remote),
			lastSuccessfulPushRuns: async () =>
				await Promise.reject(new Error("forge down")),
		};
		for (let i = 0; i < 2; i++) {
			// eslint-disable-next-line no-await-in-loop -- runs in order
			const result = await cli(["run"], later, {
				event: dispatch,
				forge: failing,
			});
			expect(result).toMatchObject({
				code: 1,
				stdout: "",
				stderr: expect.stringContaining("error[E_BASE_REQUIRED]"),
			});
		}

		expect(remote.calls).toEqual([]);
		expect(remote.tags.size).toBe(0);
		expect(remote.prs[0]?.labels).toEqual(["tallyrelease: pending"]);

		const [first, second] = await twice(later, [], { event: dispatch });
		expect(first.stderr).toContain("warning[W_NO_LAST_SUCCESS]");
		expect(first.plan?.released).toMatchObject([
			{ tag: "a-v1.1.0", catchUp: true, pr: 1 },
			{ tag: "b-v1.1.0", catchUp: true, pr: 1 },
		]);
		expect(first.plan?.warnings.map((w) => w.code)).toContain(
			"W_RELEASED_NO_BASE",
		);
		expect(second.plan?.released).toEqual([]);
	});

	it("prints the actions without effects with --dry-run (E27)", async () => {
		const { remote, runs, merge, twice } = await setup();
		runs.push("c2");
		const merged = merge(dag);
		remote.calls.length = 0;

		const [first, second] = await twice(merged, ["--dry-run"], {
			event: push("c2"),
		});
		expect(first.stdout).toMatch(
			/^PR #1: would tag a-v1\.1\.0, b-v1\.1\.0 at merge-1\nPR #1: would create releases a-v1\.1\.0, b-v1\.1\.0\nPR #1: would label released\nno release PRs\n/u,
		);
		expect(first.plan?.released).toMatchObject([
			{ tag: "a-v1.1.0", pr: 1 },
			{ tag: "b-v1.1.0", pr: 1 },
		]);
		expect(second).toEqual(first);
		expect(remote.calls).toEqual([]);
		expect(remote.tags.size).toBe(0);
	});

	it("tags merges in HEAD but leaves release PRs alone on an old run (E33)", async () => {
		const { remote, runs, merge, twice } = await setup();
		runs.push("c2");
		const merged = merge(dag);
		// A later merged release PR and a newer line tip than this run's HEAD.
		remote.prs.push(
			...remote.prs.map((p) => ({
				...p,
				number: 2,
				mergedAt: "2026-10-16T00:00:00Z",
				mergeCommitSha: "newer",
			})),
		);
		remote.branches.set("main", "newer");
		remote.calls.length = 0;

		const [first] = await twice(merged, [], { event: push("c2") });
		expect(first).toMatchObject({
			code: 0,
			stderr: expect.stringContaining("warning[W_PR_HEAD_BEHIND]"),
		});
		expect(first.stdout).toContain(
			"PR #1: labelled released\nPR #2: merge newer is not in HEAD; left pending\n",
		);
		expect(remote.prs.map((p) => p.labels)).toEqual([
			["tallyrelease: released"],
			["tallyrelease: pending"],
		]);
	});

	it("does nothing on pull request events and without a line rule", async () => {
		const { remote, cli } = await setup();
		remote.calls.length = 0;

		expect(
			await cli(["run"], dag, { event: { name: "pull_request", payload: {} } }),
		).toEqual({
			code: 0,
			stdout: "",
			stderr:
				"warning[W_EFFECT_SKIPPED]: run does nothing on pull_request events\n",
		});
		expect((await cli(["run", "--branch", "feature"], dag)).stderr).toBe(
			'warning[W_EFFECT_SKIPPED]: run does nothing on branch "feature" without a line rule\n',
		);
		expect(remote.calls).toEqual([]);
	});
});

describe("plan", () => {
	it("fills released with the PR of the release commit, null without a token (E26)", async () => {
		const { runs, merge, run, cli } = await setup();
		runs.push("c2");
		const merged = merge(dag);
		await run(merged, [], { event: push("c2") });

		const plan = async (opts: RunOptions) => {
			const result = await cli(["plan", "--json"], merged, {
				event: push("c2"),
				...opts,
			});

			return planSchema.parse(JSON.parse(result.stdout)).released;
		};

		expect(await plan({})).toMatchObject([
			{ tag: "a-v1.1.0", pr: 1 },
			{ tag: "b-v1.1.0", pr: 1 },
		]);
		expect(await plan({ env: { GITHUB_TOKEN: undefined } })).toMatchObject([
			{ tag: "a-v1.1.0", pr: null },
			{ tag: "b-v1.1.0", pr: null },
		]);
	});
});
