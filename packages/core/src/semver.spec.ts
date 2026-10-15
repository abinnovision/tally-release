import { describe, expect, it } from "vitest";

import { semver } from "./semver.js";

import type { PreCtx, Unit } from "./plugin.js";

const v = (raw: string) => {
	const parsed = semver.parse(raw);
	if (!parsed) {
		throw new Error(`not a version: ${raw}`);
	}

	return parsed;
};

const unit: Unit = {
	id: "a",
	root: "a",
	plugin: "config",
	include: [],
	exclude: [],
	version: "tag",
	scheme: "semver",
	tagFormat: "{id}-v{version}",
	propagate: "auto",
	tags: [],
	meta: {},
};

const ctx = (sinceLineBase: number): PreCtx => ({
	unit,
	head: "abc",
	baseTag: null,
	tags: [],
	firstParent: { sinceLineBase, total: 10 },
});

describe("semver", () => {
	it("parses strict SemVer 2.0 only", () => {
		expect(semver.format(v("1.2.3-rc.1+build.5"))).toBe("1.2.3-rc.1+build.5");
		for (const raw of ["v1.0.0", "1.0", " 1.0.0", "01.0.0", "1.0.0-01"]) {
			expect(semver.parse(raw)).toBeUndefined();
		}
	});

	it("orders by SemVer precedence and ignores build metadata", () => {
		const sorted = ["1.0.0", "1.0.0-beta.10", "1.0.0-alpha", "1.0.0-beta.2"]
			.map(v)
			.sort(semver.compare)
			.map(semver.format);
		expect(sorted).toEqual([
			"1.0.0-alpha",
			"1.0.0-beta.2",
			"1.0.0-beta.10",
			"1.0.0",
		]);
		expect(semver.compare(v("1.0.0+a"), v("1.0.0+b"))).toBe(0);
	});

	it("reports core and prerelease state", () => {
		expect(semver.core(v("2.3.4-rc.1"))).toEqual({
			major: 2,
			minor: 3,
			patch: 4,
		});
		expect(semver.isPrerelease(v("2.3.4-rc.1"))).toBe(true);
		expect(semver.isPrerelease(v("2.3.4"))).toBe(false);
		expect(semver.format(semver.initial())).toBe("1.0.0");
	});

	it("bumps like semver inc, also from a prerelease", () => {
		const bump = (raw: string, level: "major" | "minor" | "patch") =>
			semver.format(semver.bump(v(raw), level));
		expect(bump("1.2.3", "major")).toBe("2.0.0");
		expect(bump("1.2.3", "minor")).toBe("1.3.0");
		expect(bump("1.2.3", "patch")).toBe("1.2.4");
		expect(bump("2.0.0-beta.1", "major")).toBe("2.0.0");
		expect(bump("1.2.0-beta.1", "major")).toBe("2.0.0");
		expect(bump("1.2.0-beta.1", "minor")).toBe("1.2.0");
		expect(bump("1.2.3-beta.1", "minor")).toBe("1.3.0");
		expect(bump("1.2.3-beta.1", "patch")).toBe("1.2.3");
	});

	it("keeps stable releases and renders prereleases", () => {
		expect(semver.format(semver.release(v("2.0.0"), ctx(3)))).toBe("2.0.0");
		expect(
			semver.format(
				semver.prerelease(v("2.0.0"), { ...ctx(3), channel: "beta" }),
			),
		).toBe("2.0.0-beta.3");
		expect(() =>
			semver.prerelease(v("2.0.0"), { ...ctx(3), channel: "be ta" }),
		).toThrow(expect.objectContaining({ code: "E_CHANNEL_INVALID" }));
	});
});
