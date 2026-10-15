interface MermaidUnit {
	id: string;
	version: string;
}

interface MermaidEdge {
	from: string;
	to: string;
	pinned: boolean;
}

/** Renders units and edges as a Mermaid flowchart; inputs are already sorted. */
export const renderMermaid = (
	units: readonly MermaidUnit[],
	edges: readonly MermaidEdge[],
): string => {
	const index = new Map(units.map((u, i) => [u.id, `u${String(i)}`]));
	const lines = ["flowchart LR"];
	let released = false;

	for (const u of units) {
		const isReleased = u.version !== "none";
		released ||= isReleased;
		lines.push(
			`  ${index.get(u.id) ?? ""}["${u.id}"]${isReleased ? ":::released" : ""}`,
		);
	}

	for (const e of edges) {
		lines.push(
			`  ${index.get(e.from) ?? ""} ${e.pinned ? "-->" : "-.->"} ${index.get(e.to) ?? ""}`,
		);
	}

	if (released) {
		lines.push("  classDef released stroke:#333,stroke-width:3px");
	}

	return `${lines.join("\n")}\n`;
};
