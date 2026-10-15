import { describe, expect, it } from "vitest";

import { compareShadow, isSquashBody } from "./compare.js";

import type { CompareInput, ShadowUnit } from "./compare.js";
import type { PlanChange, UnitPlan } from "@tallyrelease/core";

const planned = (
	id: string,
	next: string | null,
	extra: Partial<UnitPlan> = {},
): UnitPlan => ({
	id,
	path: `packages/${id}`,
	plugin: "node",
	scheme: "semver",
	tags: [],
	group: null,
	affected: { reason: "all", via: [] },
	kind: "prerelease",
	baseTag: null,
	lineBaseTag: null,
	from: null,
	bump: null,
	releaseAs: null,
	propagatedFrom: [],
	absorbedFrom: [],
	next,
	version: null,
	sha: "head",
	changes: [],
	...extra,
});

const unit = (
	id: string,
	released = true,
	dependsOn: string[] = [],
): ShadowUnit => ({ id, path: `packages/${id}`, released, dependsOn });

const compare = (input: Partial<CompareInput>) =>
	compareShadow({
		before: {},
		after: {},
		plan: { units: [] },
		units: [],
		rpConfig: {},
		messages: new Map(),
		bumpTypes: new Set(["feat", "fix"]),
		...input,
	}).map((r) => [r.path, r.status, r.labels.join(",")]);

const change = (type: string, extra: Partial<PlanChange> = {}): PlanChange => ({
	sha: type,
	type,
	breaking: false,
	subject: type,
	...extra,
});

describe("compareShadow", () => {
	it("matches and mismatches changed manifest paths", () => {
		const rows = compareShadow({
			before: { "packages/a": "1.0.0", "packages/b": "1.0.0" },
			after: { "packages/a": "1.1.0", "packages/b": "1.0.1" },
			plan: {
				units: [
					planned("a", "1.1.0", { from: "1.0.0" }),
					planned("b", "1.1.0", { from: "1.0.0" }),
				],
			},
			units: [unit("a"), unit("b")],
			rpConfig: {},
			messages: new Map(),
			bumpTypes: new Set(),
		});
		expect(rows).toEqual([
			{
				path: "packages/a",
				unit: "a",
				status: "match",
				before: "1.0.0",
				after: "1.1.0",
				from: "1.0.0",
				next: "1.1.0",
				labels: [],
			},
			{
				path: "packages/b",
				unit: "b",
				status: "mismatch",
				before: "1.0.0",
				after: "1.0.1",
				from: "1.0.0",
				next: "1.1.0",
				labels: [],
			},
		]);
	});

	it("labels known divergence classes", () => {
		expect(
			compare({
				before: {
					"packages/a": "1.0.0",
					"packages/b": "1.0.0",
					"packages/c": "1.0.0",
					"packages/h": "1.0.0",
				},
				after: {
					"packages/a": "1.1.0",
					"packages/b": "1.0.1",
					"packages/c": "1.0.0",
					"packages/d": "0.1.0",
					"packages/h": "1.0.0",
					"tools/x": "1.0.0",
				},
				plan: {
					units: [
						planned("a", "1.2.0", {
							from: "1.0.0",
							changes: [change("feat", { via: "internal" })],
						}),
						planned("c", "1.0.1", { from: "1.0.0", propagatedFrom: ["a"] }),
						planned("e", "2.0.0"),
						planned("g", "1.1.0", { from: "1.0.0", group: "sdk" }),
						planned("h", "1.0.1", { from: "1.0.0" }),
					],
				},
				units: [
					unit("a"),
					unit("b", true, ["a"]),
					unit("c"),
					unit("d", false),
					unit("e"),
					unit("g"),
					unit("h"),
				],
				rpConfig: {
					"separate-pull-requests": true,
					packages: { "packages/h": { "separate-pull-requests": false } },
				},
			}),
		).toEqual([
			["packages/a", "mismatch", "absorbed-internal"],
			["packages/b", "rp-only", "dependent-patch"],
			["packages/c", "tallyrelease-only", "dependent-patch,separate-pr"],
			["packages/d", "rp-only", "release-config"],
			["packages/e", "tallyrelease-only", "release-config,separate-pr"],
			[
				"packages/g",
				"tallyrelease-only",
				"group-vs-rp,release-config,separate-pr",
			],
			["packages/h", "tallyrelease-only", ""],
			["tools/x", "rp-only", "release-config"],
		]);
	});

	it("leaves differences the labels do not explain unlabelled", () => {
		expect(
			compare({
				before: {
					"packages/a": "1.0.0",
					"packages/b": "1.0.0",
					"packages/c": "1.0.0",
					"packages/r": "1.0.0",
				},
				after: {
					"packages/a": "1.1.0",
					"packages/b": "1.0.1",
					"packages/c": "1.0.0",
					"packages/r": "1.2.0",
				},
				plan: {
					units: [
						planned("a", "1.1.0", { from: "1.0.0" }),
						// Dependency changed, but tallyrelease releases a minor.
						planned("b", "1.1.0", { from: "1.0.0" }),
						// Only an absorbed chore.
						planned("c", "1.0.1", {
							from: "1.0.0",
							changes: [change("chore", { via: "internal" })],
						}),
						// release-please is higher despite absorbed changes.
						planned("r", "1.1.0", {
							from: "1.0.0",
							changes: [change("feat", { via: "internal" })],
						}),
					],
				},
				units: [unit("a"), unit("b", true, ["a"]), unit("c"), unit("r")],
			}),
		).toEqual([
			["packages/a", "match", ""],
			["packages/b", "mismatch", ""],
			["packages/c", "tallyrelease-only", ""],
			["packages/r", "mismatch", ""],
		]);
	});

	it("labels squash-split where release-please splits a squash body", () => {
		expect(isSquashBody("chore: deps (#7)\n\nfeat(ui): new option")).toBe(true);
		expect(isSquashBody("fix: x\n\nBEGIN_NESTED_COMMIT\nfeat: y")).toBe(true);
		expect(isSquashBody("chore: deps\n\n* feat: bullet")).toBe(false);
		expect(isSquashBody("fix: x\n\nfixes: #12")).toBe(false);

		const messages = new Map([
			["s1", "chore: deps (#7)\n\nfeat: new option"],
			["s2", "fix: crash\n\nfixes: #12"],
		]);
		expect(
			compare({
				before: {
					"packages/a": "1.0.0",
					"packages/b": "1.0.0",
					"packages/c": "1.0.0",
				},
				after: {
					"packages/a": "1.1.0",
					"packages/b": "1.1.0",
					"packages/c": "1.1.0",
				},
				plan: {
					units: [
						planned("a", null, { changes: [change("chore", { sha: "s1" })] }),
						planned("b", "1.0.1", {
							from: "1.0.0",
							changes: [change("fix", { sha: "s2" })],
						}),
						planned("c", "1.0.1", {
							from: "1.0.0",
							changes: [change("chore", { sha: "s1" })],
						}),
					],
				},
				units: [unit("a"), unit("b"), unit("c")],
				messages,
			}),
		).toEqual([
			["packages/a", "rp-only", "squash-split"],
			["packages/b", "mismatch", ""],
			["packages/c", "mismatch", "squash-split"],
		]);
	});
});
