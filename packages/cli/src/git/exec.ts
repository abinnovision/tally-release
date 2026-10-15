import { execFile } from "node:child_process";

export interface GitOptions {
	debug?: ((message: string) => void) | undefined;
	/** Added to the process environment. */
	env?: Readonly<Record<string, string>>;
}

export interface GitResult {
	code: number;
	stdout: string;
	stderr: string;
}

/** Runs `git` in `cwd`; resolves with the exit code instead of rejecting. */
export const git = (
	cwd: string,
	args: readonly string[],
	{ debug, env }: GitOptions = {},
): Promise<GitResult> => {
	debug?.(`git ${args.join(" ")}`);

	return new Promise((resolve, reject) => {
		execFile(
			"git",
			["-c", "core.quotePath=false", ...args],
			{
				cwd,
				encoding: "utf8",
				maxBuffer: 256 * 1024 * 1024,
				...(env && { env: { ...process.env, ...env } }),
			},
			(error, stdout, stderr) => {
				if (error === null) {
					resolve({ code: 0, stdout, stderr });
				} else if (typeof error.code === "number") {
					resolve({ code: error.code, stdout, stderr });
				} else {
					reject(new Error(error.message, { cause: error }));
				}
			},
		);
	});
};

/** Runs `git` and returns stdout; throws on a non-zero exit code. */
export const gitOk = async (
	cwd: string,
	args: readonly string[],
	opts?: GitOptions,
): Promise<string> => {
	const result = await git(cwd, args, opts);
	if (result.code !== 0) {
		throw new Error(
			`git ${args.join(" ")} failed (${String(result.code)}): ${result.stderr.trim()}`,
		);
	}

	return result.stdout;
};
