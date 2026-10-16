import { describe, expect, it } from "vitest";

import { renderFloatingTags, validateFloating } from "./floating.js";
import { semver } from "./semver.js";

const unit = { id: "web", tagFormat: "{id}-v{version}" };
const tags = [
	"web-v1.4.2",
	"web-v2.0.0",
	"web-v2.1.0-beta.1",
	"web-v1",
	"api-v9.0.0",
];

describe("renderFloatingTags", () => {
	it("moves a floating tag only to the highest version rendering to it (F01)", () => {
		const formats = ["{id}-v{major}"];

		expect(
			renderFloatingTags(unit, "1.4.3", { tags, scheme: semver, formats }),
		).toEqual(["web-v1"]);
		expect(
			renderFloatingTags(unit, "1.4.1", { tags, scheme: semver, formats }),
		).toEqual([]);
		expect(
			renderFloatingTags(unit, "2.0.1", { tags, scheme: semver, formats }),
		).toEqual(["web-v2"]);
	});

	it("renders {id}, {major} and {minor}; prereleases never float (F02)", () => {
		const formats = ["{id}-v{major}", "{id}-v{major}.{minor}", "{id}-v{major}"];

		expect(
			renderFloatingTags(unit, "1.3.9", { tags, scheme: semver, formats }),
		).toEqual(["web-v1.3"]);
		expect(
			renderFloatingTags(unit, "2.0.1", { tags, scheme: semver, formats }),
		).toEqual(["web-v2", "web-v2.0"]);
		expect(
			renderFloatingTags(unit, "2.1.0-beta.2", {
				tags,
				scheme: semver,
				formats,
			}),
		).toEqual([]);
	});

	it("rejects unknown tokens", () => {
		expect(() => {
			validateFloating(["v{major}", "{id}-{patch}"]);
		}).toThrow(expect.objectContaining({ code: "E_CONFIG" }));
	});
});
