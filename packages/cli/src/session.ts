import { computePlan, loadWorkspace, TallyError } from "@tallyrelease/core";
import { existsSync } from "node:fs";
import { basename, relative, resolve, sep } from "node:path";

import { githubContext } from "./ci/github-env.js";
import { loadConfig } from "./config/load.js";
import { githubForge } from "./forge/github.js";
import { gitTreeFs, nodeFs } from "./fs-ctx.js";
import { git as runGit } from "./git/exec.js";
import { gitReader } from "./git/reader.js";
import { painter } from "./output/paint.js";
import { builtinPlugins } from "./plugins/index.js";

import type { Env, GithubContext } from "./ci/github-env.js";
import type { Forge } from "./forge/forge.js";
import type { RepoGit } from "./git/reader.js";
import type {
	Plan,
	PlanOptions,
	ReadonlyFs,
	Warning,
	Workspace,
} from "@tallyrelease/core";

export interface Writer {
	write: (chunk: string) => unknown;
}

/** Injected environment of a cli run; `bin.ts` wires the real one. */
export interface Deps {
	env: Env;
	cwd: string;
	stdout: Writer;
	stderr: Writer;
	/** Defaults to the `git` executable at the repo root. */
	git?: RepoGit;
	/** Defaults to `node:fs` at the repo root. */
	fs?: ReadonlyFs;
	/** Files at a commit; defaults to the git object store at the repo root. */
	fsAt?: (ref: string) => ReadonlyFs;
	/** Defaults to GitHub when a token is available; used only with a token. */
	forge?: Forge;
}

export interface GlobalOptions {
	cwd?: string;
	config: string;
	token?: string;
	verbose?: boolean;
}

/** Resolved dependencies shared by all commands. */
export interface Session {
	readonly cwd: string;
	readonly root: string;
	readonly env: Env;
	readonly stdout: Writer;
	readonly fs: ReadonlyFs;
	readonly git: RepoGit;
	readonly github: GithubContext | undefined;
	/** Undefined without a token. */
	readonly forge: Forge | undefined;
	readonly workspace: () => Promise<Workspace>;
	/**
	 * Runs `use` with the workspace and files at commit `ref`, or of the
	 * working tree when `ref` is null; the config is always read from the
	 * working tree.
	 */
	readonly workspaceAt: <T>(
		ref: string | null,
		use: (workspace: Workspace, fs: ReadonlyFs) => Promise<T>,
	) => Promise<T>;
	/** `computePlan` with the workspace and files of `workspaceAt(ref)`. */
	readonly planAt: (
		ref: string | null,
		opts: Omit<PlanOptions, "fs">,
	) => Promise<Plan>;
	readonly warn: (warnings: readonly Warning[]) => void;
}

export const createSession = (deps: Deps, opts: GlobalOptions): Session => {
	const root = resolve(deps.cwd, opts.cwd ?? ".");
	const debug = opts.verbose
		? (message: string) => deps.stderr.write(`debug: ${message}\n`)
		: undefined;
	const fs = deps.fs ?? nodeFs(root);
	const github = githubContext(deps.env);
	const token = opts.token ?? deps.env["GITHUB_TOKEN"];
	const configPath = relative(root, resolve(root, opts.config))
		.split(sep)
		.join("/");
	// Injected git or fs means there is no repository on disk to query.
	const onDisk = deps.git === undefined && deps.fs === undefined;

	const assertRepoRoot = async () => {
		if (!existsSync(root)) {
			throw new TallyError(
				"E_CWD_MISSING",
				`directory "${root}" does not exist`,
				{
					cwd: root,
				},
			);
		}

		const result = await runGit(
			root,
			["rev-parse", "--show-toplevel", "--show-prefix"],
			debug,
		);
		if (result.code !== 0) {
			throw new TallyError("E_NOT_A_REPO", `not a git repository: ${root}`, {
				cwd: root,
			});
		}

		const [toplevel = "", prefix = ""] = result.stdout.split("\n");
		if (prefix !== "") {
			throw new TallyError(
				"E_NOT_REPO_ROOT",
				`"${root}" is below the repository root "${toplevel}"; run from the root or pass --cwd`,
				{ cwd: root, toplevel },
			);
		}
	};

	// GITHUB_REPOSITORY, else the origin url, else the directory name.
	const repoName = async () => {
		const fromEnv = deps.env["GITHUB_REPOSITORY"]?.split("/")[1];
		if (fromEnv) {
			return fromEnv;
		}

		if (onDisk) {
			const origin = await runGit(root, ["remote", "get-url", "origin"], debug);
			const name =
				origin.code === 0
					? /([^/:]+?)(?:\.git)?\/*$/.exec(origin.stdout.trim())?.[1]
					: undefined;
			if (name) {
				return name;
			}
		}

		return basename(root);
	};

	const repoGit = deps.git ?? gitReader(root, debug);

	const workspaceAt = async <T>(
		ref: string | null,
		use: (workspace: Workspace, files: ReadonlyFs) => Promise<T>,
	): Promise<T> => {
		if (onDisk) {
			await assertRepoRoot();
		}

		const config = loadConfig(fs, configPath);
		const files =
			ref === null ? fs : (deps.fsAt?.(ref) ?? gitTreeFs(root, ref));
		const workspace = await loadWorkspace({
			config,
			configFile: configPath,
			plugins: Object.values(builtinPlugins),
			fs: files,
			repo: { name: await repoName() },
			...(debug && { debug }),
		});

		return await use(workspace, files);
	};

	return {
		cwd: deps.cwd,
		root,
		env: deps.env,
		stdout: deps.stdout,
		fs,
		git: repoGit,
		github,
		forge: token
			? (deps.forge ?? githubForge({ token, baseUrl: github?.apiUrl }))
			: undefined,
		workspace: async () =>
			await workspaceAt(null, (workspace) => Promise.resolve(workspace)),
		workspaceAt,
		planAt: async (ref, opts) =>
			await workspaceAt(
				ref,
				async (workspace, files) =>
					await computePlan(workspace, repoGit, {
						...opts,
						fs: files,
						...(debug && { debug }),
					}),
			),
		warn: (warnings) => {
			const paint = painter(deps.stderr);
			for (const w of warnings) {
				deps.stderr.write(
					`${paint("yellow", `warning[${w.code}]`)}: ${w.plugin ? `${w.plugin}: ` : ""}${w.message}\n`,
				);
			}
		},
	};
};

/** PR head branch, else the GitHub ref name, else the checked-out branch, else `HEAD`. */
export const branchName = async (
	session: Pick<Session, "git" | "github">,
): Promise<string> =>
	session.github?.headRef ??
	session.github?.refName ??
	(await session.git.branch()) ??
	"HEAD";
