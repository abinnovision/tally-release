import { randomUUID } from "node:crypto";

import type { AffectedDoc } from "@tallyrelease/core";

const multiline = (key: string, value: string): string => {
	const delimiter = `ghadelimiter_${randomUUID()}`;

	return `${key}<<${delimiter}\n${value}\n${delimiter}\n`;
};

/** `$GITHUB_OUTPUT` entries of `affected`; units are ordered by id. */
export const affectedGithubOutput = (doc: AffectedDoc): string =>
	[
		`affected=${JSON.stringify(doc.units.map(({ id, path, plugin, reason, released, tags }) => ({ id, path, plugin, reason, released, tags })))}\n`,
		multiline("affected-paths", doc.units.map((u) => u.path).join("\n")),
		`all=${String(doc.build.all)}\n`,
		`base=${doc.build.base ?? ""}\n`,
		`base-source=${doc.build.baseSource}\n`,
	].join("");

/** `$GITHUB_OUTPUT` entry of `plan`: the path of the written plan document. */
export const planGithubOutput = (path: string): string => `plan=${path}\n`;
