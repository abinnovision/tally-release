import { z } from "zod";

import type { AffectedDoc } from "@tallyrelease/core";

const reason = z.enum(["direct", "dependent", "global", "all"]);

/** Schema of `tallyrelease affected --json`, published as `affected.schema.json`. */
export const affectedDocSchema = z.strictObject({
	schema: z.literal(1),
	tool: z.string(),
	repo: z.string(),
	branch: z.string(),
	head: z.string(),
	build: z.strictObject({
		base: z.string().nullable(),
		baseSource: z.enum([
			"cli",
			"push-before",
			"pr-merge-base",
			"merge-group",
			"forge-last-success",
			"local-merge-base",
			"none",
		]),
		all: z.boolean(),
		globalInputs: z.array(z.string()),
	}),
	units: z.array(
		z.strictObject({
			id: z.string(),
			path: z.string(),
			plugin: z.string(),
			reason,
			via: z.array(z.string()),
			released: z.boolean(),
			tags: z.array(z.string()),
		}),
	),
	unattributed: z.array(z.string()),
	warnings: z.array(
		z.strictObject({
			code: z.string(),
			message: z.string(),
			plugin: z.string().exactOptional(),
			unit: z.string().exactOptional(),
		}),
	),
}) satisfies z.ZodType<AffectedDoc>;
