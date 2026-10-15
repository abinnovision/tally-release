import { randomUUID } from "node:crypto";

import type { AffectedDoc } from "@tallyrelease/core";

const multiline = (key: string, value: string): string => {
	const delimiter = `ghadelimiter_${randomUUID()}`;

	return `${key}<<${delimiter}\n${value}\n${delimiter}\n`;
};

/** `$GITHUB_OUTPUT` entries of `affected`; units are ordered by id. */
export const affectedGithubOutput = (doc: AffectedDoc): string =>
	[
		`affected=${JSON.stringify(doc.units.map(({ id, path, reason }) => ({ id, path, reason })))}\n`,
		multiline("affected-paths", doc.units.map((u) => u.path).join("\n")),
		`all=${String(doc.build.all)}\n`,
		`base=${doc.build.base ?? ""}\n`,
		`base-source=${doc.build.baseSource}\n`,
	].join("");
