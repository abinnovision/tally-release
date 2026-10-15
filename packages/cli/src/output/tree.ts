export interface Tree {
	lines: string[];
	/** A `(*)` marker was printed. */
	shared: boolean;
	/** A `(cycle)` marker was printed. */
	cycle: boolean;
}

/**
 * Renders `children` as trees from the units without dependencies, in id order.
 * Units left unvisited (pure cycles) become extra roots, smallest id first.
 */
export const renderTree = (
	ids: readonly string[],
	children: (id: string) => readonly string[],
): Tree => {
	const tree: Tree = { lines: [], shared: false, cycle: false };
	const visited = new Set<string>();
	const path = new Set<string>();

	const visit = (id: string, branch: string, prefix: string): void => {
		const kids = children(id);
		if (path.has(id)) {
			tree.lines.push(`${branch}${id} (cycle)`);
			tree.cycle = true;

			return;
		}

		if (visited.has(id) && kids.length > 0) {
			tree.lines.push(`${branch}${id} (*)`);
			tree.shared = true;

			return;
		}

		tree.lines.push(`${branch}${id}`);
		visited.add(id);
		path.add(id);
		kids.forEach((kid, i) => {
			const last = i === kids.length - 1;
			visit(
				kid,
				`${prefix}${last ? "└── " : "├── "}`,
				`${prefix}${last ? "    " : "│   "}`,
			);
		});
		path.delete(id);
	};

	const inDegree = new Map(ids.map((id) => [id, 0]));
	for (const id of ids) {
		for (const kid of children(id)) {
			inDegree.set(kid, (inDegree.get(kid) ?? 0) + 1);
		}
	}

	for (const id of ids) {
		if (inDegree.get(id) === 0) {
			visit(id, "", "");
		}
	}

	for (
		let root = ids.find((id) => !visited.has(id));
		root !== undefined;
		root = ids.find((id) => !visited.has(id))
	) {
		visit(root, "", "");
	}

	return tree;
};
