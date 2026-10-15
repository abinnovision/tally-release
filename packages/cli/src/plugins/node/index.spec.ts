import { memoryCtx } from "@tallyrelease/core/testing";
import { describe, expect, it } from "vitest";

import { nodePlugin } from "./index.js";

import type { Unit } from "@tallyrelease/core";

const pkg = (o: Record<string, unknown>) => JSON.stringify(o);

const unit = (id: string, root: string, packageName: string): Unit => ({
	id,
	root,
	plugin: "node",
	include: [],
	exclude: [],
	version: "file",
	scheme: "semver",
	tagFormat: "",
	propagate: "auto",
	tags: [],
	initialVersion: null,
	meta: { node: { packageName } },
});

const discover = async (files: Record<string, string>) =>
	await nodePlugin.discover?.(memoryCtx({ files, repo: "mono" }));

describe("node discovery", () => {
	const members = {
		"packages/a/package.json": pkg({ name: "@s/a" }),
		"packages/b/package.json": pkg({ name: "@s/b" }),
	};

	it.each([[["packages/*"]], [{ packages: ["packages/*"] }]])(
		"reads yarn/npm workspaces %j",
		async (workspaces) => {
			const units = await discover({
				"package.json": pkg({ workspaces }),
				...members,
			});
			expect(units?.map((u) => u.id)).toEqual(["a", "b"]);
		},
	);

	it("reads pnpm-workspace.yaml and honors negations", async () => {
		const units = await discover({
			"pnpm-workspace.yaml": "packages:\n  - 'packages/*'\n  - '!packages/b'\n",
			"package.json": pkg({}),
			...members,
		});
		expect(units).toEqual([
			{
				id: "a",
				root: "packages/a",
				version: "file",
				meta: { packageName: "@s/a" },
			},
		]);
	});

	it("treats a single-package repo as unit '.' with the repo name", async () => {
		const units = await discover({ "package.json": pkg({ name: "solo" }) });
		expect(units).toEqual([
			{ id: "mono", root: ".", version: "file", meta: { packageName: "solo" } },
		]);
	});

	it("treats workspaces without packages as a repo without packages", async () => {
		const units = await discover({
			"package.json": pkg({ name: "solo", workspaces: {} }),
		});
		expect(units).toEqual([]);
	});

	it("finds nothing without package.json", async () => {
		expect(await discover({})).toEqual([]);
	});
});

describe("node edges", () => {
	const units = [
		unit("a", "packages/a", "@s/a"),
		unit("b", "packages/b", "@s/b"),
	];
	const edgesFor = async (deps: Record<string, unknown>) =>
		await nodePlugin.edges?.(
			memoryCtx({
				files: { "packages/b/package.json": pkg({ name: "@s/b", ...deps }) },
			}),
			units,
		);

	it.each([
		["dependencies", "1.2.3", true],
		["dependencies", "workspace:*", true],
		["dependencies", "workspace:1.2.3", true],
		["dependencies", "=1.2.3", true],
		["dependencies", "v1.2.3", true],
		["dependencies", "^1.2.3", false],
		["dependencies", "workspace:^", false],
		["dependencies", "~1.2.3", false],
		["optionalDependencies", "1.2.3", true],
		["peerDependencies", "1.2.3", false],
		["devDependencies", "workspace:*", false],
	])("%s %s pinned=%s", async (field, range, pinned) => {
		const edges = await edgesFor({ [field]: { "@s/a": range } });
		expect(edges).toEqual([
			{ from: "a", to: "b", reason: `${field}: @s/a`, pinned },
		]);
	});

	it("warns about duplicate package names", async () => {
		const ctx = memoryCtx({ files: {} });
		await nodePlugin.edges?.(ctx, [
			unit("a", "packages/a", "@s/a"),
			unit("a2", "packages/a2", "@s/a"),
		]);
		expect(ctx.warnings).toEqual([
			'package "@s/a" is declared by "packages/a" and "packages/a2"; using "packages/a2"',
		]);
	});

	it("ignores external packages", async () => {
		expect(await edgesFor({ dependencies: { lodash: "1.0.0" } })).toEqual([]);
	});
});

describe("node inputs", () => {
	it("adds root package.json for workspace repos only", async () => {
		const ws = await nodePlugin.inputs?.(
			memoryCtx({ files: { "package.json": pkg({ workspaces: ["p/*"] }) } }),
		);
		const single = await nodePlugin.inputs?.(
			memoryCtx({ files: { "package.json": pkg({ name: "x" }) } }),
		);
		expect(ws?.global).toEqual(
			expect.arrayContaining([
				"yarn.lock",
				"package-lock.json",
				"pnpm-lock.yaml",
				"pnpm-workspace.yaml",
				".yarnrc.yml",
				".yarn/patches/**",
				"package.json",
				"tsconfig*.json",
				"turbo.json",
			]),
		);
		expect(single?.global).not.toContain("package.json");
	});
});
