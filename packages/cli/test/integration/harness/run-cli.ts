import { writeFileSync } from "node:fs";
import { join } from "node:path";

import { tmpDir } from "./git-repo.js";
import { main } from "../../../src/index.js";

import type { Deps } from "../../../src/index.js";

export interface RunOptions extends Partial<Omit<Deps, "stdout" | "stderr">> {
	/** GitHub event name and payload, written to `GITHUB_EVENT_PATH`. */
	event?: { name: string; payload: Record<string, unknown> };
}

export interface RunResult {
	code: number;
	stdout: string;
	stderr: string;
}

/** GitHub Actions variables of a push run of `ci.yaml` on `main`. */
export const actionsEnv = {
	GITHUB_REPOSITORY: "acme/repo",
	GITHUB_REF_NAME: "main",
	GITHUB_WORKFLOW_REF: "acme/repo/.github/workflows/ci.yaml@refs/heads/main",
};

/** Calls `main()` in-process and captures its output. */
export const runCli = async (
	argv: string[],
	opts: RunOptions = {},
): Promise<RunResult> => {
	const { event, env, cwd, ...deps } = opts;
	const eventEnv: Record<string, string> = {};
	if (event) {
		const path = join(tmpDir("event"), "event.json");
		writeFileSync(path, JSON.stringify(event.payload));
		eventEnv["GITHUB_EVENT_NAME"] = event.name;
		eventEnv["GITHUB_EVENT_PATH"] = path;
	}

	let stdout = "";
	let stderr = "";
	const code = await main(argv, {
		...deps,
		env: { ...env, ...eventEnv },
		cwd: cwd ?? "/work/repo",
		stdout: { write: (s: string) => (stdout += s) },
		stderr: { write: (s: string) => (stderr += s) },
	});

	return { code, stdout, stderr };
};
