import {
	base,
	configFiles,
	stylistic,
	vitest,
} from "@abinnovision/eslint-config-base";
import { defineConfig, globalIgnores } from "eslint/config";
import { builtinModules } from "node:module";

import type { Linter } from "eslint";

const nodeBuiltins = `^(node:)?(${[
	...new Set(builtinModules.map((m) => m.replace(/^node:/, ""))),
].join("|")})(/.*)?$`;
const impureGlobals = ["process", "fetch", "require", "Buffer"];
const pluginPurity: Linter.RulesRecord = {
	"no-restricted-globals": ["error", ...impureGlobals],
	"no-restricted-properties": [
		"error",
		...impureGlobals.map((property) => ({ object: "globalThis", property })),
	],
	"no-restricted-syntax": [
		"error",
		{
			selector: "ImportExpression",
			message: "plugins use Ctx only: no dynamic imports.",
		},
	],
};

export default defineConfig([
	{
		extends: [base, vitest, stylistic],
		languageOptions: {
			parserOptions: {
				project: "./tsconfig.json",
				tsconfigRootDir: import.meta.dirname,
			},
		},
	},
	{ files: ["*.{c,m,}{t,j}s"], extends: [configFiles] },
	{
		files: ["src/plugins/*.ts"],
		ignores: ["src/plugins/**/*.spec.ts"],
		rules: {
			"no-restricted-imports": [
				"error",
				{
					patterns: [
						{
							regex: nodeBuiltins,
							message: "plugins use Ctx only (public API).",
						},
						{
							regex: "^\\.\\./",
							message:
								"plugins import only @tallyrelease/core and src/plugins/**.",
						},
					],
				},
			],
			...pluginPurity,
		},
	},
	{
		files: ["src/plugins/*/**/*.ts"],
		ignores: ["src/plugins/**/*.spec.ts"],
		rules: {
			"no-restricted-imports": [
				"error",
				{
					patterns: [
						{
							regex: nodeBuiltins,
							message: "plugins use Ctx only (public API).",
						},
						{
							regex: "^\\.\\./\\.\\./",
							message:
								"plugins import only @tallyrelease/core and src/plugins/**.",
						},
					],
				},
			],
			...pluginPurity,
		},
	},
	globalIgnores(["**/*.generated.ts", "**/*.gen.ts", "dist"]),
]);
