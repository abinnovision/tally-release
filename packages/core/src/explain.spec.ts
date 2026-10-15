import { describe, expect, it } from "vitest";

import { explainUnit } from "./explain.js";
import { memoryFs, memoryGit } from "./testing.js";
import { loadWorkspace } from "./workspace.js";

import type { TallyConfig } from "./config.js";

const git = memoryGit({
	commits: [
		{ id: "c0", files: { "app/x": "0", "lib/x": "0" } },
		{ id: "c1", message: "feat: lib", files: { "lib/x": "1" } },
	],
	tags: [{ name: "app-v1.0.0", commit: "c0" }],
});

const explain = async (unit: string, groups?: TallyConfig["groups"]) => {
	const workspace = await loadWorkspace({
		config: {
			plugins: {},
			units: { app: { release: true }, lib: {} },
			deps: [{ from: "lib", to: "app" }],
			...(groups && { groups }),
		},
		plugins: [],
		fs: memoryFs(git.tree("c1")),
		repo: { name: "demo" },
	});

	return await explainUnit(workspace, git, {
		tool: "test",
		branch: "main",
		head: "c1",
		base: "c0",
		baseSource: "cli",
		fs: memoryFs(git.tree("c1")),
		unit,
	});
};

describe("explainUnit", () => {
	it("lists absorbed changes with their files", async () => {
		const result = await explain("app");
		expect(result.unit).toMatchObject({ next: "1.0.1" });
		expect(result.changes).toMatchObject([
			{ sha: "c1", via: "lib", files: ["lib/x"] },
		]);
		expect((await explain("lib")).files).toEqual(["lib/x"]);
	});

	it("names the unit's group", async () => {
		expect((await explain("app")).group).toBeNull();
		expect((await explain("app", { web: { units: ["app"] } })).group).toEqual({
			name: "web",
			members: ["app"],
		});
	});

	it("rejects an unknown unit", async () => {
		await expect(explain("nope")).rejects.toMatchObject({
			code: "E_UNIT_UNKNOWN",
		});
	});
});
