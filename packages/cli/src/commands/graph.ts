import type { Session } from "../session.js";

/** Prints units and edges. */
export const graph = async (
	session: Session,
	flags: { json?: boolean },
): Promise<void> => {
	const workspace = await session.workspace();
	session.warn(workspace.warnings);

	const units = workspace.units.map((u) => ({
		id: u.id,
		path: u.root,
		plugin: u.plugin,
		version: u.version,
	}));
	const edges = workspace.graph.edges.map((e) => ({
		from: e.from,
		to: e.to,
		pinned: e.pinned,
		reasons: e.reasons,
	}));

	if (flags.json) {
		session.stdout.write(
			`${JSON.stringify({ repo: workspace.repo, units, edges }, null, 2)}\n`,
		);

		return;
	}

	for (const u of units) {
		session.stdout.write(`${u.id}\t${u.path}\t${u.plugin}\n`);
	}

	for (const e of edges) {
		session.stdout.write(
			`${e.from} -> ${e.to}${e.pinned ? " (pinned)" : ""}\n`,
		);
	}
};
