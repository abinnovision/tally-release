import { Ajv } from "ajv";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

import { configJsonSchema } from "./schema.js";

const read = (path: string) =>
	readFileSync(new URL(path, import.meta.url), "utf8");

const validate = new Ajv({ strict: false }).compile(configJsonSchema());

// Examples from design.md A.10 that only use currently supported keys.
const examples = [
	...read("../../../../docs/design.md").matchAll(/```yaml\n([\s\S]*?)```/g),
]
	.map((m) => m[1]!.split("# v0.2")[0]!)
	.filter((y) => y.startsWith("# ") && !y.includes("branches:"));

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

	it("rejects version none and unknown keys", () => {
		expect(validate({ units: { a: { version: "none" } } })).toBe(false);
		expect(validate({ nope: 1 })).toBe(false);
	});
});
