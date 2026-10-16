import { describe, expect, it } from "vitest";

import { releaseEntries } from "./releases.js";

import type { Plan } from "@tallyrelease/core";

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
});

describe("releaseEntries", () => {
	it("renders tagPrefix, null with text after the version or an unknown unit", () => {
		const plan = {
			head: "abc",
			line: null,
			released: ["a", "b", "c"].map(released),
			units: [],
		} as unknown as Plan;
		const entries = releaseEntries(plan, [
			{ id: "a", tagFormat: "{id}-v{version}" },
			{ id: "b", tagFormat: "v{version}-{id}" },
		]);

		expect(entries.map((e) => e.tagPrefix)).toEqual(["a-v", null, null]);
	});
});
