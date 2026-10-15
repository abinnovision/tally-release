import { memoryGit } from "@tallyrelease/core/testing";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { Dag } from "@tallyrelease/core/testing";

const dirs: string[] = [];

// fast-import reads C-style quoted paths; JSON escapes are compatible.
const quote = (path: string) =>
	/["\\\t\n]/.test(path) ? JSON.stringify(path) : path;

const data = (content: string) =>
	`data ${String(Buffer.byteLength(content))}\n${content}\n`;

/** Fresh directory under the OS tmp dir, removed by `removeTmpDirs`. */
export const tmpDir = (name = "repo"): string => {
	const parent = mkdtempSync(join(tmpdir(), "tallyrelease-"));
	dirs.push(parent);
	const dir = join(parent, name);
	mkdirSync(dir);

	return dir;
};

export const removeTmpDirs = (): void => {
	for (const dir of dirs.splice(0)) {
		rmSync(dir, { recursive: true, force: true });
	}
};

export const git = (cwd: string, ...args: string[]): string =>
	execFileSync("git", args, { cwd, encoding: "utf8" }).trim();

export interface Repo {
	dir: string;
	/** Commit id in the dag to its sha. */
	sha: (id: string) => string;
}

/**
 * Real repository with the commits and tags of `dag` (via `git fast-import`),
 * branch `main` at the last commit, checked out.
 */
export const createRepo = (dag: Dag, name?: string): Repo => {
	const dir = tmpDir(name);
	const trees = memoryGit(dag);
	const ids = dag.commits.map((c) => c.id);
	const mark = (id: string) => `:${String(ids.indexOf(id) + 1)}`;
	const ident = (date: string) =>
		`Test <test@example.com> ${String(Date.parse(date) / 1000)} +0000`;

	let stream = "";
	dag.commits.forEach((c, i) => {
		const prior = dag.commits[i - 1];
		const [first, ...merges] = c.parents ?? (prior ? [prior.id] : []);
		const date = c.date ?? new Date(Date.UTC(2024, 0, 1, 0, i)).toISOString();
		stream += first === undefined ? "reset refs/heads/main\n" : "";
		stream += `commit refs/heads/main\nmark ${mark(c.id)}\n`;
		stream += `author ${ident(date)}\ncommitter ${ident(date)}\n`;
		stream += data(c.message ?? c.id);
		stream += first === undefined ? "" : `from ${mark(first)}\n`;
		stream += merges.map((m) => `merge ${mark(m)}\n`).join("");
		stream += "deleteall\n";
		for (const [path, content] of Object.entries(trees.tree(c.id))) {
			stream += `M 100644 inline ${quote(path)}\n${data(content)}`;
		}
	});

	for (const t of dag.tags ?? []) {
		stream += t.annotated
			? `tag ${t.name}\nfrom ${mark(t.commit)}\ntagger ${ident("2024-01-01T00:00:00Z")}\n${data(t.name)}`
			: `reset refs/tags/${t.name}\nfrom ${mark(t.commit)}\n`;
	}

	const last = ids.at(-1) ?? "";
	stream += `reset refs/heads/main\nfrom ${mark(last)}\n`;

	git(dir, "init", "--quiet", "--initial-branch=main");
	const marks = join(dir, ".git", "marks");
	execFileSync("git", ["fast-import", "--quiet", `--export-marks=${marks}`], {
		cwd: dir,
		input: stream,
	});
	git(dir, "reset", "--quiet", "--hard", "main");

	const shas = new Map(
		readFileSync(marks, "utf8")
			.trim()
			.split("\n")
			.map((line) => {
				const [m = "", sha = ""] = line.split(" ");

				return [m, sha] as const;
			}),
	);

	return {
		dir,
		sha: (id) => {
			const sha = shas.get(mark(id));
			if (sha === undefined) {
				throw new Error(`unknown commit "${id}"`);
			}

			return sha;
		},
	};
};
