import { z } from "zod";

import { affectedDocSchema } from "./affected-schema.js";

import type { Plan } from "@tallyrelease/core";

/** True only for identical types, including optional fields. */
/* eslint-disable @typescript-eslint/no-unnecessary-type-parameters -- identity check */
type Equals<A, B> =
	(<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
		? true
		: false;
/* eslint-enable @typescript-eslint/no-unnecessary-type-parameters */

const bump = z.enum(["major", "minor", "patch"]);

const changeSchema = z.strictObject({
	sha: z.string().exactOptional(),
	type: z.string(),
	breaking: z.boolean(),
	scope: z.string().exactOptional(),
	subject: z.string(),
	notes: z.string().exactOptional(),
	pr: z.number().exactOptional(),
	via: z.string().exactOptional(),
	releaseAs: z.string().exactOptional(),
});

/** Schema of `tallyrelease plan --json`, published as `plan.schema.json`. */
export const planSchema = z.strictObject({
	...affectedDocSchema.omit({ units: true }).shape,
	line: z
		.strictObject({
			rule: z.string(),
			kind: z.enum(["default", "maintenance"]),
			channel: z.string().nullable(),
			maxBump: z.enum(["minor", "patch"]).nullable(),
			absolute: z
				.strictObject({
					unit: z.string().nullable(),
					group: z.string().nullable(),
					major: z.number(),
					minor: z.number().exactOptional(),
				})
				.nullable(),
		})
		.nullable(),
	units: z.array(
		z.strictObject({
			id: z.string(),
			path: z.string(),
			plugin: z.string(),
			scheme: z.string(),
			tags: z.array(z.string()),
			group: z.string().nullable(),
			affected: z
				.strictObject({
					reason: affectedDocSchema.shape.units.element.shape.reason,
					via: z.array(z.string()),
				})
				.nullable(),
			kind: z.enum(["prerelease", "rebuild", "none"]),
			baseTag: z.string().nullable(),
			lineBaseTag: z.string().nullable(),
			from: z.string().nullable(),
			bump: bump.nullable(),
			releaseAs: z.string().nullable(),
			propagatedFrom: z.array(z.string()),
			absorbedFrom: z.array(z.string()),
			next: z.string().nullable(),
			version: z.string().nullable(),
			sha: z.string(),
			changes: z.array(changeSchema),
		}),
	),
	groups: z.array(
		z.strictObject({
			name: z.string(),
			members: z.array(z.string()),
			baseTag: z.string().nullable(),
			from: z.string().nullable(),
			bump: bump.nullable(),
			next: z.string().nullable(),
			version: z.string().nullable(),
		}),
	),
	released: z.array(
		z.strictObject({
			id: z.string(),
			path: z.string(),
			version: z.string(),
			tag: z.string(),
			floatingTags: z.array(z.string()),
			releaseSha: z.string(),
			catchUp: z.boolean(),
			pr: z.number().nullable(),
			line: z.enum(["default", "maintenance"]),
		}),
	),
}) satisfies z.ZodType<Plan>;

// Fails to compile when the schema misses or adds a field of `Plan`.
export const planSchemaExact: Equals<z.infer<typeof planSchema>, Plan> = true;

/** One entry of the `releases` output of `run --github-output`. */
export const releaseEntrySchema = z.strictObject({
	id: z.string(),
	path: z.string(),
	kind: z.enum(["release", "prerelease"]),
	version: z.string(),
	channel: z.string().nullable(),
	tag: z.string().nullable(),
	/** Literal part of the tag format before `{version}`; null for prereleases. */
	tagPrefix: z.string().nullable(),
	sha: z.string(),
	releaseSha: z.string(),
	catchUp: z.boolean(),
	pr: z.number().nullable(),
	line: z.enum(["default", "maintenance"]),
	/** Changes of the release; of a prerelease, those since the last stable release. */
	changes: z.array(changeSchema),
});

export type ReleaseEntry = z.infer<typeof releaseEntrySchema>;
