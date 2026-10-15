import { validateBranches } from "./branches.js";
import { TallyError } from "./errors.js";
import { schemeRegistry } from "./schemes.js";
import { compileTagFormat, matchUnitTags, noMatchingTag } from "./tags.js";
import { uniqueSorted } from "./util.js";

import type { Warning } from "./errors.js";
import type { TagRef, VersionScheme } from "./plugin.js";
import type { Workspace } from "./workspace.js";

/**
 * Release-only checks, never run by `affected`: scheme registry, schemes, tag
 * formats and initial versions of released units, group members, branch rules
 * and channels. Returns the scheme registry.
 */
export const validateRelease = (
	workspace: Workspace,
): ReadonlyMap<string, VersionScheme<any>> => {
	const schemes = schemeRegistry(workspace.schemes);
	for (const unit of workspace.units) {
		if (unit.version === "none") {
			continue;
		}

		const scheme = schemes.get(unit.scheme);
		if (!scheme) {
			throw new TallyError(
				"E_SCHEME_UNKNOWN",
				`unit "${unit.id}" uses unknown scheme "${unit.scheme}"`,
				{ unit: unit.id, scheme: unit.scheme },
			);
		}

		compileTagFormat(unit.tagFormat, unit.id);
		if (
			unit.initialVersion !== null &&
			scheme.parse(unit.initialVersion) === undefined
		) {
			throw new TallyError(
				"E_INITIAL_VERSION",
				`initial version "${unit.initialVersion}" of unit "${unit.id}" is not a ${unit.scheme} version`,
				{ unit: unit.id, version: unit.initialVersion },
			);
		}
	}

	const units = new Map(workspace.units.map((u) => [u.id, u]));
	for (const { name, members } of workspace.groups) {
		const unreleased = members.find((id) => units.get(id)?.version === "none");
		if (unreleased !== undefined) {
			throw new TallyError(
				"E_GROUP_NOT_RELEASED",
				`group "${name}" names unit "${unreleased}", which is not released`,
				{ group: name, unit: unreleased },
			);
		}

		const schemeNames = uniqueSorted(
			members.map((id) => units.get(id)?.scheme ?? ""),
		);
		if (schemeNames.length > 1) {
			throw new TallyError(
				"E_GROUP_SCHEME",
				`members of group "${name}" use different schemes: ${schemeNames.join(", ")}`,
				{ group: name, schemes: schemeNames },
			);
		}
	}

	validateBranches(workspace.release.branches);

	return schemes;
};

/**
 * Checks `tags` against the released units: throws `E_TAG_FORMAT_OVERLAP`,
 * returns `W_NO_MATCHING_TAG` warnings.
 */
export const validateTags = (
	workspace: Workspace,
	tags: readonly TagRef[],
): Warning[] => {
	const matched = matchUnitTags(
		workspace.units,
		tags,
		schemeRegistry(workspace.schemes),
	);

	return noMatchingTag(
		workspace.units,
		[...matched].map(([id, m]) => ({ id, tags: m.tags })),
		uniqueSorted(tags.map((t) => t.name)),
	);
};
