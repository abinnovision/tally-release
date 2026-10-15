import { validateBranches } from "./branches.js";
import { TallyError } from "./errors.js";
import { schemeRegistry } from "./schemes.js";
import { compileTagFormat } from "./tags.js";

import type { VersionScheme } from "./plugin.js";
import type { Workspace } from "./workspace.js";

/**
 * Release-only checks, never run by `affected`: scheme registry, schemes, tag
 * formats and initial versions of released units, branch rules and channels.
 * Returns the scheme registry.
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

	validateBranches(workspace.release.branches);

	return schemes;
};
