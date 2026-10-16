import { memoryFs, memoryGit } from "@tallyrelease/core/testing";

import type { RepoGit } from "../../../src/index.js";
import type { ReadonlyFs, TagRef } from "@tallyrelease/core";
import type { Dag } from "@tallyrelease/core/testing";

const byName = (a: TagRef, b: TagRef) => (a.name < b.name ? -1 : 1);

/**
 * `RepoGit` and `ReadonlyFs` over a commit graph; the last commit is HEAD on
 * `main`. Tags are the dag's plus the live maps in `tags` (for example the
 * remote's, then the run's local tags; later maps win).
 */
export const memoryRepo = (
	dag: Dag,
	tags: readonly ReadonlyMap<string, string>[] = [],
): {
	git: RepoGit;
	fs: ReadonlyFs;
	fsAt: (ref: string) => ReadonlyFs;
} => {
	const base = memoryGit(dag);
	const ids = dag.commits.map((c) => c.id);
	// memoryGit answers synchronously.
	const ancestor = (a: string, b: string) => base.isAncestor(a, b) as boolean;
	const liveTag = (name: string) =>
		tags.findLast((m) => m.has(name))?.get(name);
	const remoteTags = (): TagRef[] =>
		[...new Set(tags.flatMap((m) => [...m.keys()]))]
			.filter((name) => !dag.tags?.some((t) => t.name === name))
			.map((name) => ({ name, sha: liveTag(name) ?? "" }))
			// Tags on commits outside this dag (another run's history) are skipped.
			.filter((t) => ids.includes(t.sha));
	const resolve = (ref: string): string | undefined => {
		if (ref.endsWith("^1")) {
			const commit = resolve(ref.slice(0, -2));

			return commit === undefined ? undefined : base.parents(commit)[0];
		}

		return ref === "HEAD"
			? ids.at(-1)
			: ids.includes(ref)
				? ref
				: (dag.tags?.find((t) => t.name === ref)?.commit ?? liveTag(ref));
	};

	return {
		git: {
			...base,
			tags: () => [...(base.tags() as TagRef[]), ...remoteTags()].sort(byName),
			tagsMerged: (ref) => {
				const head = resolve(ref) ?? ref;

				return [
					...(base.tagsMerged(head) as TagRef[]),
					...remoteTags().filter((t) => ancestor(t.sha, head)),
				].sort(byName);
			},
			resolve,
			mergeBase: (a, b) =>
				ids.findLast((id) => ancestor(id, a) && ancestor(id, b)),
			isShallow: () => false,
			branch: () => "main",
			defaultBranch: () => undefined,
		},
		fs: memoryFs(base.tree("HEAD")),
		fsAt: (ref) => memoryFs(base.tree(ref)),
	};
};
