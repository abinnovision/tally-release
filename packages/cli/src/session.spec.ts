import { describe, expect, it } from "vitest";

import { webUrl } from "./session.js";

describe("webUrl", () => {
	it.each([
		["https://github.com/o/r.git", "https://github.com/o/r"],
		["https://u:p@ss@host/o/r.git", "https://host/o/r"],
		["https://x-access-token:ghs_abc@github.com/o/r", "https://github.com/o/r"],
		["ssh://git@host:2222/o/r.git/", "https://host/o/r"],
		["git@github.com:o/r.git", "https://github.com/o/r"],
		["/srv/git/r.git", null],
		["file:///srv/git/r.git", null],
	])("maps %s", (remote, url) => {
		expect(webUrl(remote)).toBe(url);
	});
});
