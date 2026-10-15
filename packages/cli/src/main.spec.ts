import { memoryFs } from "@tallyrelease/core/testing";
import { describe, expect, it } from "vitest";

import { main } from "./main.js";
import { version } from "./version.js";

import type { RepoGit } from "./git/reader.js";
import type { Deps } from "./session.js";

const run = async (argv: string[], deps: Partial<Deps> = {}) => {
	let stdout = "";
	let stderr = "";
	const code = await main(argv, {
		env: {},
		cwd: "/",
		stdout: { write: (s: string) => (stdout += s) },
		stderr: { write: (s: string) => (stderr += s) },
		...deps,
	});

	return { code, stdout, stderr };
};

describe("main", () => {
	it("prints the version", async () => {
		expect(await run(["--version"])).toEqual({
			code: 0,
			stdout: `${version}\n`,
			stderr: "",
		});
	});

	it("exits 2 on usage errors", async () => {
		const result = await run(["affected", "--nope"]);

		expect(result.code).toBe(2);
		expect(result.stderr).toContain("unknown option");
	});

	it("prints stack and cause of unexpected errors with --verbose", async () => {
		const git = {
			resolve: () => {
				throw new Error("boom", { cause: new Error("root cause") });
			},
		} as unknown as RepoGit;
		const fs = memoryFs({ "tallyrelease.yaml": "plugins: {}\n" });

		const quiet = await run(["affected"], { git, fs });
		expect(quiet).toMatchObject({
			code: 1,
			stderr: "error[E_INTERNAL]: boom\n",
		});

		const verbose = await run(["--verbose", "affected"], { git, fs });
		expect(verbose.code).toBe(1);
		expect(verbose.stderr).toMatch(
			/^error\[E_INTERNAL\]: boom\nError: boom\n\s+at /,
		);
		expect(verbose.stderr).toContain("[cause]: Error: root cause");
	});
});
