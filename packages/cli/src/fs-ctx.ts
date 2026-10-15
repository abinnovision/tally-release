import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
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
