import { Writable } from "node:stream";
import { afterEach, describe, expect, it, vi } from "vitest";

import { painter } from "./paint.js";

afterEach(() => {
	vi.unstubAllEnvs();
});

describe("painter", () => {
	it("keeps text plain for non-stream writers", () => {
		vi.stubEnv("FORCE_COLOR", "1");

		expect(painter({ write: () => true })("red", "x")).toBe("x");
	});

	it("colors a stream with FORCE_COLOR", () => {
		vi.stubEnv("FORCE_COLOR", "1");
		vi.stubEnv("NO_COLOR", undefined);

		expect(painter(new Writable())("red", "x")).toBe("\u001B[31mx\u001B[39m");
	});

	it("keeps text plain for a stream that is no TTY", () => {
		vi.stubEnv("FORCE_COLOR", undefined);

		expect(painter(new Writable())("red", "x")).toBe("x");
	});
});
