import { memoryFs, memoryGit } from "@tallyrelease/core/testing";

import type { RepoGit } from "../../../src/index.js";
import type { ReadonlyFs } from "@tallyrelease/core";
import type { Dag } from "@tallyrelease/core/testing";

/** `RepoGit` and `ReadonlyFs` over a commit graph; the last commit is HEAD on `main`. */
export const memoryRepo = (dag: Dag): { git: RepoGit; fs: ReadonlyFs } => {
	const base = memoryGit(dag);
	const ids = dag.commits.map((c) => c.id);
	// memoryGit answers synchronously.
	const ancestor = (a: string, b: string) => base.isAncestor(a, b) as boolean;
	const resolve = (ref: string) =>
		ref === "HEAD"
			? ids.at(-1)
			: ids.includes(ref)
				? ref
				: dag.tags?.find((t) => t.name === ref)?.commit;

	return {
		git: {
			...base,
			resolve,
			mergeBase: (a, b) =>
				ids.findLast((id) => ancestor(id, a) && ancestor(id, b)),
			isShallow: () => false,
			branch: () => "main",
			defaultBranch: () => undefined,
		},
		fs: memoryFs(base.tree("HEAD")),
	};
};
