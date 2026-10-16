import {
	validateRelease,
	validateTags,
	versionFileClaims,
} from "@tallyrelease/core";

import { count } from "../output/count.js";

import type { Session } from "../session.js";

/**
 * Validates config, plugins, units, graph and release config; with released
 * units also the repository's tags.
 */
export const check = async (session: Session): Promise<void> => {
	const workspace = await session.workspace();
	session.warn(workspace.warnings);
	validateRelease(workspace);
	await versionFileClaims(workspace);
	const released = workspace.units
		.filter((u) => u.version !== "none")
		.map((u) => u.id);
	if (released.length > 0) {
		session.warn(validateTags(workspace, await session.git.tags()));
	}

	const list = released.length > 0 ? `: ${released.join(", ")}` : "";
	session.stdout.write(
		`ok: ${count(workspace.units.length, "unit")} (${String(released.length)} released${list}), ${count(workspace.graph.edges.length, "edge")}\n`,
	);
};
