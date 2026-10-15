import type { Session } from "../session.js";

/** Validates config, plugins, units and graph. */
export const check = async (session: Session): Promise<void> => {
	const workspace = await session.workspace();
	session.warn(workspace.warnings);
	session.stdout.write(
		`ok: ${String(workspace.units.length)} units, ${String(workspace.graph.edges.length)} edges\n`,
	);
};
