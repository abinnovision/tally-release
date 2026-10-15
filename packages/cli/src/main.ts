import { CONFIG_FILE, TallyError } from "@tallyrelease/core";
import { Command, CommanderError, Option } from "commander";
import { inspect } from "node:util";

import { affected } from "./commands/affected.js";
import { check } from "./commands/check.js";
import { graph } from "./commands/graph.js";
import { painter } from "./output/paint.js";
import { createSession } from "./session.js";
import { version } from "./version.js";

import type { AffectedFlags } from "./commands/affected.js";
import type { GraphFlags } from "./commands/graph.js";
import type { Deps, GlobalOptions } from "./session.js";

/** Runs the cli; returns the exit code (0 ok, 1 error, 2 usage). */
export const main = async (
	argv: readonly string[],
	deps: Deps,
): Promise<number> => {
	const program = new Command("tallyrelease")
		.description("Affected build units for monorepos and single repos")
		.version(version)
		.option("--cwd <dir>", "repository root")
		.option("--config <file>", "config file", CONFIG_FILE)
		.option("--token <token>", "forge token (default: GITHUB_TOKEN)")
		.option("--verbose", "print debug output")
		.exitOverride()
		.configureOutput({
			writeOut: (s) => deps.stdout.write(s),
			writeErr: (s) => deps.stderr.write(s),
		});
	const session = () => createSession(deps, program.opts<GlobalOptions>());

	program
		.command("check")
		.description("validate config, plugins, units and graph")
		.action(async () => {
			await check(session());
		});
	program
		.command("graph")
		.description("print units and edges")
		.option("--json", "print JSON (same as --format json)")
		.addOption(
			new Option("--format <format>", "output format").choices([
				"text",
				"json",
				"mermaid",
			]),
		)
		.action(async (flags: GraphFlags, cmd: Command) => {
			if (flags.json && flags.format !== undefined) {
				cmd.error("--json and --format cannot be combined", { exitCode: 2 });
			}

			await graph(session(), flags);
		});
	program
		.command("affected")
		.description("compute the build set")
		.option("--base <ref>", "diff against this ref")
		.option("--json", "print the affected document (same as --format json)")
		.addOption(
			new Option("--format <format>", "output format").choices([
				"text",
				"json",
				"tsv",
			]),
		)
		.option("--out <file>", "write the affected document to a file")
		.option("--github-output", "append outputs to $GITHUB_OUTPUT")
		.option(
			"--tag <tag>",
			"keep units with this tag (repeatable)",
			(tag: string, prior?: string[]) => [...(prior ?? []), tag],
		)
		.action(async (flags: AffectedFlags, cmd: Command) => {
			if (flags.json && flags.format !== undefined) {
				cmd.error("--json and --format cannot be combined", { exitCode: 2 });
			}

			await affected(session(), flags);
		});

	try {
		await program.parseAsync(argv, { from: "user" });

		return 0;
	} catch (error) {
		if (error instanceof CommanderError) {
			return error.exitCode === 0 ? 0 : 2;
		}

		const paint = painter(deps.stderr);
		if (error instanceof TallyError) {
			deps.stderr.write(
				`${paint("red", `error[${error.code}]`)}: ${error.message}\n`,
			);
		} else {
			deps.stderr.write(
				`${paint("red", "error[E_INTERNAL]")}: ${error instanceof Error ? error.message : String(error)}\n`,
			);
			if (program.opts<GlobalOptions>().verbose) {
				deps.stderr.write(`${inspect(error)}\n`);
			}
		}

		return 1;
	}
};
