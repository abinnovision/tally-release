import { count } from "../output/count.js";

import type { Session } from "../session.js";

/** Validates config, plugins, units and graph. */
export const check = async (session: Session): Promise<void> => {
	const workspace = await session.workspace();
	session.warn(workspace.warnings);
	const released = workspace.units
		.filter((u) => u.version !== "none")
		.map((u) => u.id);
	const list = released.length > 0 ? `: ${released.join(", ")}` : "";
	session.stdout.write(
		`ok: ${count(workspace.units.length, "unit")} (${String(released.length)} released${list}), ${count(workspace.graph.edges.length, "edge")}\n`,
	);
};
