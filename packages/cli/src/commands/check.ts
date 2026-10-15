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
		`ok: ${String(workspace.units.length)} units (${String(released.length)} released${list}), ${String(workspace.graph.edges.length)} edges\n`,
	);
};
