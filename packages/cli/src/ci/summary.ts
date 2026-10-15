import { appendFileSync } from "node:fs";

/** Appends markdown to `$GITHUB_STEP_SUMMARY`; false when it is not set. */
export const appendStepSummary = (
	env: Readonly<Record<string, string | undefined>>,
	markdown: string,
): boolean => {
	const path = env["GITHUB_STEP_SUMMARY"];
	if (!path) {
		return false;
	}

	appendFileSync(path, markdown);

	return true;
};
