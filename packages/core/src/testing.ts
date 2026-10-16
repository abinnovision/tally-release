import picomatch from "picomatch/posix.js";
import { beforeAll, describe, expect, it } from "vitest";

import { compare, uniqueSorted } from "./util.js";

import type {
	Ctx,
	GitReader,
	MaybePromise,
	RawCommit,
	ReadonlyFs,
	TagRef,
} from "./plugin.js";

const SKIPPED = new Set([".git", "node_modules"]);

type Tree = ReadonlyMap<string, string>;

interface Node {
	id: string;
	parents: string[];
	message: string;
	date: string;
	tree: Tree;
	/** Inclusive ancestor set. */
	ancestors: ReadonlySet<string>;
}

const changed = (a: Tree, b: Tree): string[] =>
	uniqueSorted([...a.keys(), ...b.keys()]).filter((p) => a.get(p) !== b.get(p));

/** Path git would C-quote without `-z`. */
const ODD_PATH = 'odd/a "q"\tü.txt';

const FOOTER_MESSAGE = "feat: h\n\nbody\n\nRelease-As: core@1.0.0\nRefs: #1";

const CONFORMANCE_DAG: Dag = {
	commits: [
		{
			id: "a",
			message: "chore: init",
			date: "2024-01-01T10:00:00Z",
			files: { "README.md": "a\n", "pkg/x.ts": "x\n", "lib/keep.ts": "k\n" },
		},
		{ id: "b", message: "feat: b", files: { "README.md": "b\n" } },
		{ id: "c", message: "feat: side", files: { "side.txt": "side\n" } },
		{
			id: "d",
			parents: ["b"],
			message: "refactor: rename",
			files: { "pkg/x.ts": null, "pkg/y.ts": "x\n" },
		},
		{ id: "m", parents: ["d", "c"], message: "Merge side" },
		{
			id: "e",
			message: "fix: e\n\nbody line",
			date: "2024-01-02T12:30:00Z",
			files: { "README.md": "e\n" },
		},
		{ id: "f", message: "chore: odd", files: { [ODD_PATH]: "f\n" } },
		{ id: "g", message: "chore: empty" },
		{
			id: "h",
			message: FOOTER_MESSAGE,
			files: { "README.md": "h\n" },
		},
	],
	tags: [
		{ name: "v1", commit: "a" },
		{ name: "v2", commit: "b", annotated: true },
		{ name: "side", commit: "c" },
	],
};

/**
 * First-parent chain r - s - t - u - m - v; k branches from r and merges into
 * m. s adds pkg/ab, t adds pkg/a, u deletes it and v re-adds it. k adds side
 * and gone, m drops gone and v adds it again.
 */
const INTRODUCED_DAG: Dag = {
	commits: [
		{ id: "r", files: { "lib/r.ts": "r\n" } },
		{ id: "s", files: { "pkg/ab/x.ts": "s\n" } },
		{
			id: "k",
			parents: ["r"],
			files: { "side/k.ts": "k\n", "gone/x.ts": "k\n" },
		},
		{ id: "t", parents: ["s"], files: { "pkg/a/x.ts": "t\n" } },
		{ id: "u", files: { "pkg/a/x.ts": null } },
		{ id: "m", parents: ["u", "k"], files: { "gone/x.ts": null } },
		{ id: "v", files: { "pkg/a/x.ts": "v\n", "gone/x.ts": "v\n" } },
	],
};

/** In-memory `ReadonlyFs` over a path-to-content map. */
export const memoryFs = (files: Record<string, string>): ReadonlyFs => {
	const paths = Object.keys(files).sort(compare);
	const dirs = uniqueSorted(
		paths.flatMap((p) => {
			const parts = p.split("/");

			return parts.slice(1).map((_, i) => parts.slice(0, i + 1).join("/"));
		}),
	);
	const visible = (p: string) => {
		const segments = p.split("/");

		return segments[0] !== "vendor" && !segments.some((s) => SKIPPED.has(s));
	};

	return {
		read: (path) => (Object.hasOwn(files, path) ? files[path] : undefined),
		exists: (path) =>
			path === "." || Object.hasOwn(files, path) || dirs.includes(path),
		glob: (patterns, opts) => {
			const match = picomatch(patterns, { dot: true });

			return (opts?.dirs ? dirs : paths).filter((p) => visible(p) && match(p));
		},
	};
};

export interface MemoryCtxOptions<O> {
	options?: O;
	/** Defaults to `repo`. */
	repo?: string;
	files?: Record<string, string>;
}

/** Plugin `Ctx` over `memoryFs`; collects `log.warn` messages in `warnings`. */
export const memoryCtx = <O = Record<string, never>>(
	opts: MemoryCtxOptions<O> = {},
): Ctx<O> & { readonly warnings: string[] } => {
	const warnings: string[] = [];
	const options: unknown = opts.options ?? {};

	return {
		options: options as O,
		repo: { name: opts.repo ?? "repo" },
		fs: memoryFs(opts.files ?? {}),
		log: { warn: (msg) => warnings.push(msg), debug: () => undefined },
		warnings,
	};
};

export interface DagCommit {
	id: string;
	/** Defaults to the previous commit in the list, none for the first. */
	parents?: string[];
	message?: string;
	/** Committer date, ISO 8601. */
	date?: string;
	/**
	 * Changes applied on top of the parents' tree; `null` deletes. A merge
	 * starts from a three-way merge of its parents (later parents win conflicts).
	 */
	files?: Record<string, string | null>;
}

export interface DagTag {
	name: string;
	commit: string;
	annotated?: boolean;
}

/** Commit graph in parent-before-child order. Commit ids double as shas. */
export interface Dag {
	commits: DagCommit[];
	tags?: DagTag[];
}

export interface MemoryGit extends GitReader {
	/** File contents at a commit id, tag name or `HEAD` (the last commit). */
	tree: (ref: string) => Record<string, string>;
	/** Parent commit ids of a ref. */
	parents: (ref: string) => string[];
}

/** In-memory `GitReader` over a commit graph. */
export const memoryGit = (dag: Dag): MemoryGit => {
	const nodes = new Map<string, Node>();
	const node = (ref: string): Node => {
		const id = ref === "HEAD" ? dag.commits.at(-1)?.id : ref;
		const found =
			nodes.get(id ?? "") ??
			nodes.get(dag.tags?.find((t) => t.name === ref)?.commit ?? "");
		if (!found) {
			throw new Error(`unknown ref "${ref}"`);
		}

		return found;
	};

	const mergeBase = (a: Node, b: Node): Tree => {
		const common = [...a.ancestors].filter((id) => b.ancestors.has(id));
		const best = common.find(
			(id) => !common.some((o) => o !== id && node(o).ancestors.has(id)),
		);

		return best === undefined ? new Map() : node(best).tree;
	};

	dag.commits.forEach((c, i) => {
		const prior = dag.commits[i - 1];
		const parents = (c.parents ?? (prior ? [prior.id] : [])).map(node);
		const [first, ...others] = parents;
		const tree = new Map(first?.tree);
		for (const other of others) {
			const base = first ? mergeBase(first, other) : new Map<string, string>();
			for (const path of changed(base, other.tree)) {
				const content = other.tree.get(path);
				if (content === undefined) {
					tree.delete(path);
				} else {
					tree.set(path, content);
				}
			}
		}

		for (const [path, content] of Object.entries(c.files ?? {})) {
			if (content === null) {
				tree.delete(path);
			} else {
				tree.set(path, content);
			}
		}

		nodes.set(c.id, {
			id: c.id,
			parents: parents.map((p) => p.id),
			message: c.message ?? c.id,
			date: c.date ?? new Date(Date.UTC(2024, 0, 1, 0, i)).toISOString(),
			tree,
			ancestors: new Set([c.id, ...parents.flatMap((p) => [...p.ancestors])]),
		});
	});

	const firstParentChain = (to: string): Node[] => {
		const chain: Node[] = [];
		for (let n: Node | undefined = node(to); n;) {
			chain.push(n);
			const parent: string | undefined = n.parents[0];
			n = parent === undefined ? undefined : node(parent);
		}

		return chain;
	};

	const tagRefs = (): TagRef[] =>
		(dag.tags ?? [])
			.map((t) => ({ name: t.name, sha: node(t.commit).id }))
			.sort((a, b) => compare(a.name, b.name));
	const excluded = (from: string | null): ReadonlySet<string> =>
		from === null ? new Set() : node(from).ancestors;

	return {
		tags: tagRefs,
		tagsMerged: (ref) => {
			const reachable = node(ref).ancestors;

			return tagRefs().filter((t) => reachable.has(t.sha));
		},
		isAncestor: (a, b) => node(b).ancestors.has(node(a).id),
		isFirstParentAncestor: (a, b) => {
			const id = node(a).id;

			return firstParentChain(b).some((n) => n.id === id);
		},
		log: (from, to) => {
			const skip = excluded(from);
			const reachable = node(to).ancestors;

			return dag.commits
				.map((c) => node(c.id))
				.filter((n) => reachable.has(n.id) && !skip.has(n.id))
				.filter((n) => n.parents.length <= 1)
				.reverse()
				.map((n): RawCommit => ({
					sha: n.id,
					parents: [...n.parents],
					message: n.message,
					files: changed(
						n.parents[0] === undefined ? new Map() : node(n.parents[0]).tree,
						n.tree,
					),
					date: n.date,
				}));
		},
		countFirstParent: (from, to) => {
			const skip = excluded(from);

			return firstParentChain(to).filter((n) => !skip.has(n.id)).length;
		},
		diffFiles: (from, to) => changed(node(from).tree, node(to).tree),
		introduced: (path, to) => {
			const under = (p: string) => p === path || p.startsWith(`${path}/`);
			const intro = firstParentChain(to)
				.reverse()
				.find((n) =>
					changed(
						n.parents[0] === undefined ? new Map() : node(n.parents[0]).tree,
						n.tree,
					).some(under),
				);

			return intro?.id ?? null;
		},
		tree: (ref) => Object.fromEntries(node(ref).tree),
		parents: (ref) => [...node(ref).parents],
	};
};

/** Builds a reader for `dag`; `sha` maps a commit id to the reader's sha. */
export type ReaderFactory = (
	dag: Dag,
) => MaybePromise<{ git: GitReader; sha: (id: string) => string }>;

/**
 * Shared `GitReader` spec. Fixture: a - b - d - m - e - f on the first-parent
 * chain, c branches from b and merges into m, d renames pkg/x.ts to pkg/y.ts,
 * f adds a path with a quote, a tab and a non-ASCII character, g is empty and
 * h carries footers. `a` has a later committer date than b, c and d.
 * `introduced` runs on its own fixture.
 */
export const gitReaderConformance = (makeReader: ReaderFactory): void => {
	describe("GitReader conformance", () => {
		let git: GitReader;
		let sha: (id: string) => string;
		const shas = (ids: string[]) => ids.map((id) => sha(id)).sort(compare);
		const logShas = async (from: string | null, to: string) =>
			(await git.log(from === null ? null : sha(from), sha(to)))
				.map((c) => c.sha)
				.sort(compare);

		beforeAll(async () => {
			({ git, sha } = await makeReader(CONFORMANCE_DAG));
		});

		it("lists tags peeled to commits", async () => {
			const tags = [...(await git.tags())].sort((x, y) =>
				compare(x.name, y.name),
			);
			expect(tags).toEqual([
				{ name: "side", sha: sha("c") },
				{ name: "v1", sha: sha("a") },
				{ name: "v2", sha: sha("b") },
			]);
		});

		it("lists tags merged into a ref", async () => {
			const names = async (id: string) =>
				(await git.tagsMerged(sha(id))).map((t) => t.name).sort(compare);
			expect(await names("d")).toEqual(["v1", "v2"]);
			expect(await names("e")).toEqual(["side", "v1", "v2"]);
		});

		it("checks ancestry", async () => {
			const check = (a: string, b: string) => git.isAncestor(sha(a), sha(b));
			expect(await check("a", "e")).toBe(true);
			expect(await check("c", "e")).toBe(true);
			expect(await check("d", "d")).toBe(true);
			expect(await check("e", "a")).toBe(false);
			expect(await check("c", "d")).toBe(false);
		});

		it("checks first-parent ancestry", async () => {
			const check = (a: string, b: string) =>
				git.isFirstParentAncestor(sha(a), sha(b));
			expect(await check("a", "e")).toBe(true);
			expect(await check("d", "e")).toBe(true);
			expect(await check("e", "e")).toBe(true);
			expect(await check("c", "e")).toBe(false);
		});

		it("logs commits without merges", async () => {
			expect(await logShas(null, "e")).toEqual(shas(["a", "b", "c", "d", "e"]));
			expect(await logShas("b", "e")).toEqual(shas(["c", "d", "e"]));
			expect(await logShas("d", "e")).toEqual(shas(["c", "e"]));
			expect(await logShas("e", "e")).toEqual([]);
		});

		it("logs commit details with renames as delete plus add", async () => {
			const commits = await git.log(null, sha("e"));
			const byId = (id: string) => commits.find((c) => c.sha === sha(id));
			expect(byId("a")).toMatchObject({
				parents: [],
				message: "chore: init",
				files: ["README.md", "lib/keep.ts", "pkg/x.ts"],
			});
			expect(byId("d")).toMatchObject({
				parents: [sha("b")],
				message: "refactor: rename",
				files: ["pkg/x.ts", "pkg/y.ts"],
			});
			expect(byId("e")).toMatchObject({
				parents: [sha("m")],
				message: "fix: e\n\nbody line",
				files: ["README.md"],
			});
			expect(Date.parse(byId("a")?.date ?? "")).toBe(
				Date.parse("2024-01-01T10:00:00Z"),
			);
			expect(Date.parse(byId("e")?.date ?? "")).toBe(
				Date.parse("2024-01-02T12:30:00Z"),
			);
		});

		it("lists every commit before its parents", async () => {
			const commits = await git.log(null, sha("e"));
			const index = new Map(commits.map((c, i) => [c.sha, i]));
			for (const [i, c] of commits.entries()) {
				for (const parent of c.parents) {
					expect(index.get(parent) ?? Infinity).toBeGreaterThan(i);
				}
			}
		});

		it("logs empty commits and footers verbatim", async () => {
			const commits = await git.log(sha("f"), sha("h"));
			expect(commits.map((c) => c.sha).sort(compare)).toEqual(shas(["g", "h"]));
			expect(commits.find((c) => c.sha === sha("g"))?.files).toEqual([]);
			expect(commits.find((c) => c.sha === sha("h"))).toMatchObject({
				message: FOOTER_MESSAGE,
				files: ["README.md"],
			});
		});

		it("counts first-parent commits", async () => {
			const count = (from: string | null, to: string) =>
				git.countFirstParent(from === null ? null : sha(from), sha(to));
			expect(await count(null, "e")).toBe(5);
			expect(await count("b", "e")).toBe(3);
			expect(await count("c", "e")).toBe(3);
			expect(await count("e", "e")).toBe(0);
		});

		it("diffs trees", async () => {
			const diff = async (a: string, b: string) =>
				await git.diffFiles(sha(a), sha(b));
			expect(await diff("b", "e")).toEqual([
				"README.md",
				"pkg/x.ts",
				"pkg/y.ts",
				"side.txt",
			]);
			expect(await diff("e", "b")).toEqual(await diff("b", "e"));
			expect(await diff("d", "m")).toEqual(["side.txt"]);
			expect(await diff("e", "e")).toEqual([]);
		});

		it("lists paths with quotes, tabs and non-ASCII characters verbatim", async () => {
			expect(await git.diffFiles(sha("e"), sha("f"))).toEqual([ODD_PATH]);
			expect((await git.log(sha("e"), sha("f"))).map((c) => c.files)).toEqual([
				[ODD_PATH],
			]);
		});

		describe("introduced", () => {
			let intro: GitReader;
			let introSha: (id: string) => string;
			const introduced = async (path: string) =>
				await intro.introduced(path, introSha("v"));

			beforeAll(async () => {
				({ git: intro, sha: introSha } = await makeReader(INTRODUCED_DAG));
			});

			it("finds the commit that adds a path on the chain", async () => {
				expect(await introduced("lib")).toBe(introSha("r"));
				expect(await introduced("pkg/ab")).toBe(introSha("s"));
			});

			it("attributes a path added on a side branch to the merge", async () => {
				expect(await introduced("side")).toBe(introSha("m"));
			});

			it("matches whole directories and keeps the oldest commit", async () => {
				expect(await introduced("pkg/a")).toBe(introSha("t"));
			});

			it("skips a merge identical to its first parent for the path", async () => {
				expect(await introduced("gone")).toBe(introSha("v"));
			});

			it("returns null for a path no commit touches", async () => {
				expect(await introduced("missing")).toBeNull();
			});
		});
	});
};
