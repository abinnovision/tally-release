import { describe, expect, it } from "vitest";

import { decodeBase64, encodeBase64 } from "./base64.js";
import { decodeMarker, encodeMarker } from "./marker.js";

const marker = {
	head: "a".repeat(40),
	releaseCommit: "b".repeat(40),
	releases: [
		{ id: "web", version: "1.4.0", tag: "web-v1.4.0" },
		{ id: "ü", version: "2.0.0", tag: "@scope/ü@2.0.0 ✓ 𝌆" },
	],
};

describe("base64", () => {
	it.each([
		["", ""],
		["f", "Zg=="],
		["fo", "Zm8="],
		["foo", "Zm9v"],
		["ü✓𝌆", "w7zinJPwnYyG"],
	])("encodes %j like Buffer", (text, b64) => {
		expect(encodeBase64(text)).toBe(b64);
		expect(decodeBase64(b64)).toBe(text);
	});

	it("rejects malformed input", () => {
		expect(decodeBase64("Zg=")).toBeUndefined();
		expect(decodeBase64("Z!==")).toBeUndefined();
		expect(decodeBase64("/w==")).toBeUndefined();
	});
});

describe("marker", () => {
	it("round-trips, also with non-ASCII tags (M01)", () => {
		const body = `notes\n\n${encodeMarker(marker)}\n`;

		expect(body).toMatch(
			/^notes\n\n<!-- tallyrelease-plan:v1 [A-Za-z0-9+/=]+ -->\n$/u,
		);
		expect(decodeMarker(body)).toEqual(marker);
	});

	it("stays small with 200 units (M01)", () => {
		const releases = Array.from({ length: 200 }, (_, i) => ({
			id: `unit-${String(i)}`,
			version: "10.20.30",
			tag: `unit-${String(i)}-v10.20.30`,
		}));

		expect(encodeMarker({ ...marker, releases }).length).toBeLessThan(20_000);
	});

	it("keeps only the marker fields", () => {
		const extra = { ...marker, plan: { units: [] } };

		expect(decodeMarker(encodeMarker(extra))).toEqual(marker);
	});

	it.each([
		["missing", "no marker here"],
		["bad base64", "<!-- tallyrelease-plan:v1 Zg= -->"],
		["not json", `<!-- tallyrelease-plan:v1 ${encodeBase64("{")} -->`],
		[
			"wrong shape",
			`<!-- tallyrelease-plan:v1 ${encodeBase64('{"head":"h","releaseCommit":"r","releases":[{"id":1}]}')} -->`,
		],
		["wrong version", encodeMarker(marker).replace("plan:v1", "plan:v2")],
	])("is undefined when %s (M02)", (_, body) => {
		expect(decodeMarker(body)).toBeUndefined();
	});
});
