import { TallyError } from "@tallyrelease/core";
import { parse } from "yaml";

import { configSchema } from "./schema.js";

import type { ReadonlyFs, TallyConfig } from "@tallyrelease/core";

/** Reads and validates the config file at the repo-relative `path`. */
export const loadConfig = (fs: ReadonlyFs, path: string): TallyConfig => {
	const text = fs.read(path);
	if (text === undefined) {
		throw new TallyError(
			"E_CONFIG_MISSING",
			`config file "${path}" not found`,
			{
				path,
			},
		);
	}

	let raw: unknown;
	try {
		raw = parse(text) ?? {};
	} catch (error) {
		throw new TallyError(
			"E_CONFIG",
			`${path}: ${error instanceof Error ? error.message : String(error)}`,
			{ path },
		);
	}

	const result = configSchema.safeParse(raw);
	if (!result.success) {
		const issues = result.error.issues.map(
			(i) => `${i.path.join(".") || "(root)"}: ${i.message}`,
		);
		throw new TallyError("E_CONFIG", `${path}: ${issues.join("; ")}`, {
			path,
			issues: result.error.issues,
		});
	}

	const { $schema: _, ...config } = result.data;

	return config;
};
