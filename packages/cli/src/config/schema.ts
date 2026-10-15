import { z } from "zod";

import type { TallyConfig } from "@tallyrelease/core";

const globs = z.array(z.string()).exactOptional();
const propagate = z.enum(["auto", "patch", "rebuild"]);

const unitOverlay = z.strictObject({
	id: z.string().exactOptional(),
	include: globs,
	exclude: globs,
	release: z.boolean().exactOptional(),
	version: z
		.enum(["file", "tag"], {
			error: (issue) =>
				issue.input === "none"
					? 'version "none" is not supported, use release: false'
					: undefined,
		})
		.exactOptional(),
	scheme: z.string().exactOptional(),
	tagFormat: z.string().exactOptional(),
	propagate: propagate.exactOptional(),
});

/** Schema of `tallyrelease.yaml`. */
export const configSchema = z.strictObject({
	plugins: z
		.record(z.string(), z.record(z.string(), z.unknown()).nullable())
		.default({}),
	defaults: z
		.strictObject({
			release: z.boolean().exactOptional(),
			tagFormat: z.string().exactOptional(),
			propagate: propagate.exactOptional(),
		})
		.exactOptional(),
	units: z.record(z.string(), unitOverlay).exactOptional(),
	deps: z
		.array(
			z.strictObject({
				from: z.string(),
				to: z.string(),
				pinned: z.boolean().exactOptional(),
				reason: z.string().exactOptional(),
			}),
		)
		.exactOptional(),
	ignore: globs,
	globalInputs: globs,
}) satisfies z.ZodType<TallyConfig>;
