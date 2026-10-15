import { Ajv } from "ajv";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

import { configJsonSchema } from "./schema.js";

const read = (path: string) =>
	readFileSync(new URL(path, import.meta.url), "utf8");

const validate = new Ajv({ strict: false }).compile(configJsonSchema());

// Examples from design.md A.10 without v0.3 keys and groups.
const examples = [
	...read("../../../../docs/design.md").matchAll(/```yaml\n([\s\S]*?)```/g),
]
	.map((m) => m[1]!.split("# v0.3")[0]!.replace(/^groups:\n(?: .*\n)*/m, ""))
	.filter((y) => y.startsWith("# "));

describe("configJsonSchema", () => {
	it("finds the design examples", () => {
		expect(examples.length).toBeGreaterThan(0);
	});

	it("accepts the repo config and an empty config", () => {
		expect(validate({})).toBe(true);
		expect(validate(parse(read("../../../../tallyrelease.yaml")))).toBe(true);
	});

	it.each(examples)("accepts design example %#", (yaml) => {
		expect(validate(parse(yaml))).toBe(true);
	});

	it("accepts $schema", () => {
		expect(validate({ $schema: "x" })).toBe(true);
	});

	it("accepts release keys", () => {
		expect(
			validate({
				defaults: { initialVersion: "0.1.0" },
				units: { a: { initialVersion: "2.0.0" } },
				branches: [
					{ name: "main", line: "default", channel: "beta" },
					{ name: "release/{major}.x", line: "maintenance" },
				],
				bumps: { types: { deps: "patch" }, preMajor: { breaking: "major" } },
			}),
		).toBe(true);
		expect(validate({ branches: [{ name: "main" }] })).toBe(false);
		expect(validate({ bumps: { types: { feat: "none" } } })).toBe(false);
	});

	it("rejects version none and unknown keys", () => {
		expect(validate({ units: { a: { version: "none" } } })).toBe(false);
		expect(validate({ nope: 1 })).toBe(false);
	});
});
