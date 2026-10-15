import { computeAffected, TallyError } from "@tallyrelease/core";
import { appendFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { resolveBuildBase } from "../ci/base.js";
import { affectedGithubOutput } from "../ci/outputs.js";
import { version } from "../version.js";

import type { Session } from "../session.js";

export interface AffectedFlags {
	base?: string;
	json?: boolean;
	out?: string;
	githubOutput?: boolean;
}

/** Computes the build set and writes the requested outputs. */
export const affected = async (
	session: Session,
	flags: AffectedFlags,
): Promise<void> => {
	const { git, github } = session;
	const workspace = await session.workspace();
	const head = await git.resolve("HEAD");
	if (head === undefined) {
		throw new TallyError(
			"E_NO_HEAD",
			"HEAD does not resolve to a commit; the repository has no commits",
		);
	}

	const base = await resolveBuildBase({
		git,
		head,
		cliBase: flags.base,
		github,
		forge: session.forge,
	});
	const computed = await computeAffected(workspace, git, {
		tool: `tallyrelease@${version}`,
		branch:
			github?.headRef ?? github?.refName ?? (await git.branch()) ?? "HEAD",
		head,
		base: base.base,
		baseSource: base.source,
	});
	const doc = {
		...computed,
		warnings: [...computed.warnings, ...base.warnings],
	};
	session.warn(doc.warnings);

	const json = `${JSON.stringify(doc, null, 2)}\n`;
	if (flags.out !== undefined) {
		writeFileSync(resolve(session.cwd, flags.out), json);
	}

	if (flags.githubOutput) {
		const path = session.env["GITHUB_OUTPUT"];
		if (!path) {
			throw new TallyError(
				"E_GITHUB_OUTPUT",
				"--github-output requires GITHUB_OUTPUT to be set",
			);
		}

		appendFileSync(path, affectedGithubOutput(doc));
	}

	if (flags.json) {
		session.stdout.write(json);

		return;
	}

	session.stdout.write(
		`base: ${doc.build.base ?? "none"} (${doc.build.baseSource})\n`,
	);
	for (const u of doc.units) {
		const via = u.via.length > 0 ? ` via ${u.via.join(", ")}` : "";
		session.stdout.write(`${u.id}\t${u.path}\t${u.reason}${via}\n`);
	}
};
