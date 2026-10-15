import { alignColumns } from "../output/columns.js";
import { count } from "../output/count.js";
import { painter } from "../output/paint.js";
import { renderTree } from "../output/tree.js";
import { renderMermaid } from "../render/mermaid.js";

import type { Session } from "../session.js";

export interface GraphFlags {
	format?: "text" | "json" | "mermaid";
	json?: boolean;
}

/** Prints units and edges. */
export const graph = async (
	session: Session,
	flags: GraphFlags,
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

	const format = flags.format ?? (flags.json ? "json" : "text");

	if (format === "mermaid") {
		session.stdout.write(renderMermaid(units, edges));

		return;
	}

	if (format === "json") {
		session.stdout.write(
			`${JSON.stringify({ repo: workspace.repo, units, edges }, null, 2)}\n`,
		);

		return;
	}

	if (units.length === 0) {
		session.stdout.write("no units\n");

		return;
	}

	const paint = painter(session.stdout);
	const table = [
		["UNIT", "PATH", "PLUGIN", "RELEASE"],
		...units.map((u) => [
			u.id,
			u.path,
			u.plugin,
			u.version === "none" ? "-" : u.version,
		]),
	];
	// Header is aligned unstyled so column styles do not apply to it.
	const [header = ""] = alignColumns(table);
	const [, ...rows] = alignColumns(
		table,
		{ styles: [undefined, "dim"] },
		paint,
	);
	const lines = [paint("bold", header), ...rows];

	const tree = renderTree(
		units.map((u) => u.id),
		(id) => workspace.graph.dependents.get(id) ?? [],
	);
	if (edges.length > 0) {
		lines.push("", paint("bold", "dependents"), ...tree.lines);
	}

	const released = units.filter((u) => u.version !== "none").length;
	const legend = [
		...(tree.shared ? ["(*) expanded above"] : []),
		...(tree.cycle ? ["(cycle) edge back into the current path"] : []),
	];
	lines.push(
		"",
		[
			`${count(units.length, "unit")} (${String(released)} released), ${count(edges.length, "edge")}`,
			...legend,
		].join("; "),
	);
	session.stdout.write(`${lines.join("\n")}\n`);
};
