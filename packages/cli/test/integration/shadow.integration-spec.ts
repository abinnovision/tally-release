import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

import { removeTmpDirs, tmpDir } from "./harness/git-repo.js";
import { memoryRepo } from "./harness/memory-repo.js";
import { runCli } from "./harness/run-cli.js";

import type { ShadowReport } from "../../src/commands/shadow.js";
import type { DagCommit } from "@tallyrelease/core/testing";

const config = `
plugins: {}
units:
  packages/a: { id: a, release: true }
  packages/b: { id: b, release: true }
branches:
  - { name: main, line: default }
  - { name: "release/{major}.{minor}.x", line: maintenance }
`;

const manifest = (a: string, b: string) =>
	JSON.stringify({ "packages/a": a, "packages/b": b });

/** a and b released at 1.0.0, a feat and a fix since, then `last`. */
const repo = (last: DagCommit, rpConfig = "{}") =>
	memoryRepo({
		commits: [
			{
				id: "c0",
				files: {
					"tallyrelease.yaml": config,
					"release-please-config.json": rpConfig,
					".release-please-manifest.json": manifest("1.0.0", "1.0.0"),
					"packages/a/x.ts": "0",
					"packages/b/x.ts": "0",
				},
			},
			{
				id: "c1",
				message: "feat: a option",
				files: { "packages/a/x.ts": "1" },
			},
			{
				id: "c2",
				message: "fix: b crash (#4)\n\nfeat: b option",
				files: { "packages/b/x.ts": "2" },
			},
			last,
		],
		tags: [
			{ name: "a-v1.0.0", commit: "c0" },
			{ name: "b-v1.0.0", commit: "c0" },
		],
	});

const release = (a: string, b: string): DagCommit => ({
	id: "r",
	message: "chore: release main",
	files: { ".release-please-manifest.json": manifest(a, b) },
});

const shadow = async (
	args: string[],
	last: DagCommit,
	env: Record<string, string> = {},
	rpConfig?: string,
) => {
	const dir = tmpDir("shadow");
	const out = join(dir, "report.json");
	const result = await runCli(["shadow", "--out", out, ...args], {
		...repo(last, rpConfig),
		env,
	});

	return {
		...result,
		report: JSON.parse(readFileSync(out, "utf8")) as ShadowReport,
	};
};

const rows = (report: ShadowReport) =>
	report.rows.map((r) => [r.path, r.status, r.next, r.labels.join(",")]);

afterAll(removeTmpDirs);

describe("shadow", () => {
	it("matches a release-please merge and records the pin (G23)", async () => {
		const { code, stdout, report } = await shadow(
			["--pin", "0.2.0-beta.1"],
			release("1.1.0", "1.0.1"),
			{ GITHUB_SHA: "r" },
		);
		expect(code).toBe(0);
		expect(report).toMatchObject({
			schema: 1,
			pin: "0.2.0-beta.1",
			sha: "r",
			replay: false,
			branch: "main",
			head: "r",
			planned: "c2",
			skipped: null,
			warnings: [],
		});
		expect(rows(report)).toEqual([
			["packages/a", "match", "1.1.0", ""],
			["packages/b", "match", "1.0.1", ""],
		]);
		expect(stdout).toContain("2 rows: 2 match, 0 unlabelled");
	});

	it("exits 1 on an unlabelled mismatch with --strict (G24)", async () => {
		const last = release("1.2.0", "1.0.1");
		const env = { GITHUB_ACTIONS: "true" };
		const loose = await shadow([], last, env);
		expect(loose.code).toBe(0);
		expect(rows(loose.report)[0]).toEqual([
			"packages/a",
			"mismatch",
			"1.1.0",
			"",
		]);
		expect(loose.stdout).toContain(
			"::warning title=tallyrelease shadow::packages/a: mismatch (release-please 1.2.0, tallyrelease 1.1.0)",
		);

		const strict = await shadow(["--strict"], last, env);
		expect(strict.code).toBe(1);
		expect(strict.stderr).toMatch(
			/^error\[E_SHADOW_MISMATCH\]: 1 unlabelled row/m,
		);
	});

	it("skips pushes without a manifest change (G25)", async () => {
		const { code, stderr, report } = await shadow(
			["--strict", "--rp-config", "missing.json"],
			{
				id: "f",
				message: "fix: a",
				files: { "packages/a/x.ts": "3" },
			},
		);
		expect(code).toBe(0);
		expect(report).toMatchObject({ skipped: { reason: "manifest" }, rows: [] });
		expect(report.warnings.map((w) => w.code)).toEqual([
			"W_SHADOW_INPUT_MISSING",
			"W_SHADOW_SKIPPED",
		]);
		expect(stderr).toMatch(/^warning\[W_SHADOW_SKIPPED\]: /m);
	});

	it("skips a release merge whose plan exceeds the line limit (G37)", async () => {
		const { code, stderr, report } = await shadow(
			["--strict", "--branch", "release/1.0.x"],
			release("1.1.0", "1.1.0"),
		);
		expect(code).toBe(0);
		expect(report).toMatchObject({
			branch: "release/1.0.x",
			skipped: {
				reason: "cap",
				message: expect.stringMatching(
					/^unit "a": 1\.0\.0 to 1\.1\.0 exceeds the patch limit/u,
				) as unknown,
			},
			rows: [],
		});
		expect(report.warnings.map((w) => w.code)).toEqual(["W_SHADOW_SKIPPED"]);
		expect(stderr).toMatch(/^warning\[W_SHADOW_SKIPPED\]: /m);
	});

	it("labels separate-pr and squash-split, writes the summary (G33)", async () => {
		const summary = join(tmpDir("summary"), "summary.md");
		const { code, stdout, report } = await shadow(
			["--summary", "--head", "r"],
			{
				id: "r",
				message: "chore: release b",
				files: { ".release-please-manifest.json": manifest("1.0.0", "1.1.0") },
			},
			{ GITHUB_STEP_SUMMARY: summary },
			'{ "separate-pull-requests": true }',
		);
		expect(code).toBe(0);
		expect(rows(report)).toEqual([
			["packages/a", "tallyrelease-only", "1.1.0", "separate-pr"],
			["packages/b", "mismatch", "1.0.1", "squash-split"],
		]);
		expect(stdout).toContain("2 rows: 0 match, 0 unlabelled");
		expect(readFileSync(summary, "utf8")).toContain(
			"| `packages/b` | b | mismatch | 1.0.0 | 1.1.0 | 1.0.1 | squash-split |",
		);
	});

	it("matches a fixed group first release, like linked-versions (G36)", async () => {
		const apps = (v: string) =>
			JSON.stringify({ "apps/api-server": v, "apps/groundwork": v });
		const dir = tmpDir("shadow");
		const out = join(dir, "report.json");
		const result = await runCli(
			["shadow", "--out", out],
			memoryRepo({
				commits: [
					{
						id: "c0",
						files: {
							"tallyrelease.yaml": [
								"defaults: { tagFormat: 'app-{id}-v{version}' }",
								"units:",
								"  apps/api-server: { id: api-server, release: true }",
								"  apps/groundwork: { id: groundwork, release: true }",
								"  packages/db: { id: db }",
								"deps:",
								"  - { from: db, to: api-server }",
								"  - { from: db, to: groundwork }",
								"groups:",
								"  groundwork: { units: [api-server, groundwork] }",
								"branches:",
								"  - { name: main, line: default }",
							].join("\n"),
							"release-please-config.json": JSON.stringify({
								plugins: [
									{
										type: "linked-versions",
										groupName: "groundwork",
										components: ["api-server", "groundwork"],
									},
								],
							}),
							".release-please-manifest.json": apps("0.0.0"),
							"apps/api-server/x.ts": "0",
							"apps/groundwork/x.ts": "0",
							"packages/db/x.ts": "0",
						},
					},
					{
						id: "c1",
						message: "feat: db schema",
						files: { "packages/db/x.ts": "1" },
					},
					{
						id: "r",
						message: "chore: release main",
						files: { ".release-please-manifest.json": apps("1.0.0") },
					},
				],
			}),
		);
		expect(result.code).toBe(0);
		const report = JSON.parse(readFileSync(out, "utf8")) as ShadowReport;
		expect(rows(report)).toEqual([
			["apps/api-server", "match", "1.0.0", ""],
			["apps/groundwork", "match", "1.0.0", ""],
		]);
	});
});
