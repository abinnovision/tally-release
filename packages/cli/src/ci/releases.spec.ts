import { describe, expect, it } from "vitest";

import { releaseEntries } from "./releases.js";

import type { Plan, Workspace } from "@tallyrelease/core";

const released = (id: string) => ({
	id,
	path: id,
	version: "1.0.0",
	tag: `${id}-v1.0.0`,
	floatingTags: [],
	releaseSha: "abc",
	catchUp: false,
	pr: null,
	line: "default" as const,
	latest: true,
});

const workspace = (
	units: { id: string; tagFormat?: string; tags?: string[] }[],
	groups: { name: string; members: string[] }[] = [],
) =>
	({
		units: units.map((u) => ({
			tagFormat: "{id}-v{version}",
			tags: [],
			...u,
		})),
		groups,
	}) as unknown as Workspace;

describe("releaseEntries", () => {
	it("renders tagPrefix, null with text after the version or an unknown unit", () => {
		const plan = {
			head: "abc",
			line: null,
			released: ["a", "b", "c"].map(released),
			units: [],
		} as unknown as Plan;
		const entries = releaseEntries(
			plan,
			workspace([{ id: "a" }, { id: "b", tagFormat: "v{version}-{id}" }]),
			new Map(),
		);

		expect(entries.map((e) => e.tagPrefix)).toEqual(["a-v", null, null]);
	});

	it("lists the unit's tags and group, [] and null for an unknown unit", () => {
		const plan = {
			head: "def",
			line: null,
			released: ["a", "c"].map(released),
			units: [
				{
					id: "b",
					kind: "prerelease",
					version: "1.1.0-0",
					tags: ["web"],
					group: "g",
					changes: [],
				},
			],
		} as unknown as Plan;
		const entries = releaseEntries(
			plan,
			workspace(
				[
					{ id: "a", tags: ["api", "node"] },
					{ id: "b", tags: ["web"] },
				],
				[{ name: "g", members: ["a", "b"] }],
			),
			new Map(),
		);

		expect(entries.map(({ id, tags, group }) => ({ id, tags, group }))).toEqual(
			[
				{ id: "a", tags: ["api", "node"], group: "g" },
				{ id: "c", tags: [], group: null },
				{ id: "b", tags: ["web"], group: "g" },
			],
		);
	});

	it("lists the changes at the release's parent, [] for a missing unit, and HEAD's for a prerelease", () => {
		const change = (subject: string) => ({
			type: "feat",
			breaking: false,
			subject,
		});
		const plan = {
			head: "def",
			line: null,
			released: ["a", "b"].map(released),
			units: [
				{ id: "a", kind: "prerelease", version: "1.1.0-0", changes: [] },
				{
					id: "b",
					kind: "prerelease",
					version: "1.1.0-0",
					changes: [change("pending")],
				},
			],
		} as unknown as Plan;
		const atParent = new Map([
			["abc", [{ id: "a", changes: [change("released")] }]],
		]) as unknown as Map<string, Plan["units"]>;

		expect(
			releaseEntries(plan, workspace([]), atParent).map((e) => e.changes),
		).toEqual([[change("released")], [], [], [change("pending")]]);
	});
});
