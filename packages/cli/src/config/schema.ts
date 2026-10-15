import { z } from "zod";

import type { TallyConfig } from "@tallyrelease/core";

const globs = z.array(z.string()).exactOptional();
const propagate = z.enum(["auto", "patch", "rebuild"]).meta({
	description:
		"Policy for this unit when a dependency is released: patch (at least a patch bump), rebuild (rebuild only) or auto (patch if the edge is pinned, else rebuild).",
});

const tagFormat = z.string().meta({
	description:
		"Tag template. Defaults to {id}-v{version}, or v{version} for the root unit.",
});

const initialVersion = z.string().meta({
	description:
		"Version of the first release, parsed by the unit's scheme. Defaults to the scheme's initial version (semver: 1.0.0).",
});

const bumpLevel = z.enum(["major", "minor", "patch"]);

const unitId = z.string().regex(/^(?!\.\.?$)[A-Za-z0-9._-]+$/);
const groupUnits = z.array(unitId).meta({ description: "Member unit ids." });
const groupTags = z
	.array(z.string())
	.meta({ description: "Selects released units with any of these tags." });

const unitOverlay = z.strictObject({
	id: z
		.string()
		.meta({
			description:
				"Unit id (letters, digits, dot, underscore, dash). Defaults to the discovered id, or the repo name for the root unit.",
		})
		.exactOptional(),
	include: globs.meta({
		description:
			"Globs of files owned by the unit. Replaces the default (the unit root).",
	}),
	exclude: globs.meta({
		description:
			"Globs excluded from the unit, appended to the default (roots of nested units).",
	}),
	release: z
		.boolean()
		.meta({
			description:
				"Whether the unit is versioned and tagged. Default false (build-only).",
		})
		.exactOptional(),
	version: z
		.enum(["file", "tag"], {
			error: (issue) =>
				issue.input === "none"
					? 'version "none" is not supported, use release: false'
					: undefined,
		})
		.meta({
			description:
				"Where a released unit's version lives. file: version file written by the plugin. tag: git tags only. Defaults to the plugin's version source.",
		})
		.exactOptional(),
	scheme: z
		.string()
		.meta({ description: "Versioning scheme. Defaults to semver." })
		.exactOptional(),
	tagFormat: tagFormat.exactOptional(),
	propagate: propagate.exactOptional(),
	tags: z
		.array(z.string().regex(/^[A-Za-z0-9._-]+$/))
		.meta({
			description:
				"Labels for filtering with affected --tag (letters, digits, dot, underscore, dash), for example docker or npm.",
		})
		.exactOptional(),
	initialVersion: initialVersion.exactOptional(),
});

/** Schema of `tallyrelease.yaml`. */
export const configSchema = z.strictObject({
	$schema: z
		.string()
		.meta({ description: "Schema reference for editors, ignored." })
		.exactOptional(),
	plugins: z
		.record(z.string(), z.record(z.string(), z.unknown()).nullable())
		.meta({
			description:
				"Enabled plugins and their options, run in the listed order. Only listed plugins run.",
		})
		.default({}),
	defaults: z
		.strictObject({
			release: z
				.boolean()
				.meta({
					description:
						"Release all units unless a unit sets release: false. Default false.",
				})
				.exactOptional(),
			tagFormat: tagFormat.exactOptional(),
			propagate: propagate.exactOptional(),
			initialVersion: initialVersion.exactOptional(),
		})
		.meta({ description: "Defaults applied to every unit." })
		.exactOptional(),
	units: z
		.record(z.string(), unitOverlay)
		.meta({
			description:
				"Unit overlays keyed by root path. A root without a discovered unit becomes a config-only unit.",
		})
		.exactOptional(),
	deps: z
		.array(
			z.strictObject({
				from: z.string().meta({ description: "Id of the dependency." }),
				to: z.string().meta({ description: "Id of the dependent unit." }),
				pinned: z
					.boolean()
					.meta({
						description: "Whether the dependent pins an exact version.",
					})
					.exactOptional(),
				reason: z
					.string()
					.meta({ description: "Why the edge exists." })
					.exactOptional(),
			}),
		)
		.meta({ description: "Extra dependency edges between units." })
		.exactOptional(),
	ignore: globs.meta({
		description: "Globs of files that never affect any unit, for example docs.",
	}),
	globalInputs: globs.meta({
		description:
			"Globs of files whose change affects all units, unioned with plugin defaults.",
	}),
	branches: z
		.array(
			z.strictObject({
				name: z.string().meta({
					description:
						"Branch name pattern; supports * and the captures {major} and {minor}.",
				}),
				line: z.enum(["default", "maintenance"]).meta({
					description: "Release line of matching branches.",
				}),
				channel: z
					.string()
					.meta({
						description:
							"Prerelease channel (letters, digits, dash); may use {major} and {minor} captured by name.",
					})
					.exactOptional(),
				unit: z
					.string()
					.meta({
						description:
							"Maintenance rules: ungrouped released unit whose version must be on the line captured by name. Excludes group.",
					})
					.exactOptional(),
				group: z
					.string()
					.meta({
						description:
							"Maintenance rules: fixed group whose version must be on the line captured by name. Excludes unit.",
					})
					.exactOptional(),
			}),
		)
		.meta({
			description: "Branch rules; the first rule matching the branch wins.",
		})
		.exactOptional(),
	bumps: z
		.strictObject({
			types: z
				.record(z.string(), bumpLevel)
				.meta({
					description:
						"Commit type to bump level, merged over feat: minor, fix: patch, perf: patch, revert: patch. Breaking changes bump major.",
				})
				.exactOptional(),
			preMajor: z
				.strictObject({
					breaking: bumpLevel.exactOptional(),
					feat: bumpLevel.exactOptional(),
				})
				.meta({
					description:
						"Bump levels for breaking changes and feat while the major version is 0. Default minor for both.",
				})
				.exactOptional(),
			absorbed: z
				.enum(["patch", "minor"])
				.meta({
					description:
						"Level a released unit gets from bump-producing changes absorbed from unreleased dependencies: patch (default) or minor (feat and breaking give minor, fix gives patch).",
				})
				.exactOptional(),
		})
		.meta({ description: "How commits map to bump levels." })
		.exactOptional(),
	groups: z
		.record(
			unitId,
			z.union([
				z.strictObject({
					units: groupUnits,
					tags: groupTags.exactOptional(),
				}),
				z.strictObject({
					units: groupUnits.exactOptional(),
					tags: groupTags,
				}),
			]),
		)
		.refine((groups) => Object.keys(groups).length > 0, {
			message: "groups needs at least one group",
		})
		.meta({
			description:
				"Fixed groups by name (unit id characters): members release together with one version. Each group needs units, tags or both.",
			minProperties: 1,
		})
		.exactOptional(),
}) satisfies z.ZodType<TallyConfig>;

/** JSON schema (draft-07) of `tallyrelease.yaml` as published for editors. */
export const configJsonSchema = () => ({
	...z.toJSONSchema(configSchema, { target: "draft-7", io: "input" }),
	$id: "https://cdn.jsdelivr.net/npm/@tallyrelease/cli@0/dist/tallyrelease.schema.json",
	title: "tallyrelease.yaml",
});
