import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import picomatch from "picomatch/posix.js";
import { globSync } from "tinyglobby";

import type { ReadonlyFs } from "@tallyrelease/core";

const IGNORED = ["**/.git/**", "**/node_modules/**", "vendor/**"];

/** `ReadonlyFs` over the directory `root`. */
export const nodeFs = (root: string): ReadonlyFs => ({
	read: (path) => {
		try {
			return readFileSync(join(root, path), "utf8");
		} catch {
			return undefined;
		}
	},
	exists: (path) => existsSync(join(root, path)),
	glob: (patterns, opts) =>
		globSync(patterns, {
			cwd: root,
			dot: true,
			ignore: IGNORED,
			expandDirectories: false,
			onlyDirectories: opts?.dirs ?? false,
		})
			.map((p) => p.replace(/\/$/, ""))
			.sort(),
});

/**
 * `ReadonlyFs` over the tree of commit `sha` in the repository at `root`,
 * matching `nodeFs`; paths are listed once, files read lazily.
 */
export const gitTreeFs = (root: string, sha: string): ReadonlyFs => {
	const git = (args: string[]) =>
		execFileSync("git", ["-c", "core.quotePath=false", ...args], {
			cwd: root,
			maxBuffer: 256 * 1024 * 1024,
			stdio: ["ignore", "pipe", "ignore"],
		});
	const ignored = picomatch(IGNORED, { dot: true });
	const paths = git(["ls-tree", "-r", "-z", "--name-only", sha])
		.toString("utf8")
		.split("\0")
		.filter((p) => p !== "" && !ignored(p))
		.sort();
	const files = new Set(paths);
	const dirs = [
		...new Set(
			paths.flatMap((p) => {
				const parts = p.split("/");

				return parts.slice(1).map((_, i) => parts.slice(0, i + 1).join("/"));
			}),
		),
	]
		.filter((d) => !ignored(d) && !ignored(`${d}/`))
		.sort();
	const dirSet = new Set(dirs);
	const cache = new Map<string, string | undefined>();

	return {
		read: (path) => {
			if (!files.has(path)) {
				return undefined;
			}

			if (!cache.has(path)) {
				try {
					cache.set(
						path,
						git(["cat-file", "blob", `${sha}:${path}`]).toString("utf8"),
					);
				} catch {
					cache.set(path, undefined);
				}
			}

			return cache.get(path);
		},
		exists: (path) => path === "." || files.has(path) || dirSet.has(path),
		glob: (patterns, opts) => {
			const match = picomatch([...patterns], { dot: true });

			return (opts?.dirs ? dirs : paths).filter((p) => match(p));
		},
	};
};
