import {
	base,
	configFiles,
	stylistic,
	vitest,
} from "@abinnovision/eslint-config-base";
import { defineConfig, globalIgnores } from "eslint/config";
import { builtinModules } from "node:module";

const nodeBuiltins = `^(node:)?(${[
	...new Set(builtinModules.map((m) => m.replace(/^node:/, ""))),
].join("|")})(/.*)?$`;

const impureGlobals = ["process", "fetch", "require", "Buffer"];

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
		files: ["src/**/*.ts"],
		ignores: ["src/**/*.spec.ts"],
		rules: {
			"no-restricted-imports": [
				"error",
				{
					patterns: [
						{
							regex: nodeBuiltins,
							message: "core is pure: take data, Ctx or GitReader instead.",
						},
						{
							regex: "^@tallyrelease/cli$",
							message: "core must not depend on cli.",
						},
					],
				},
			],
			"no-restricted-globals": ["error", ...impureGlobals],
			"no-restricted-properties": [
				"error",
				...impureGlobals.map((property) => ({
					object: "globalThis",
					property,
				})),
			],
			"no-restricted-syntax": [
				"error",
				{
					selector: "ImportExpression",
					message: "core is pure: no dynamic imports.",
				},
			],
		},
	},
	globalIgnores([
		"**/*.generated.ts",
		"**/*.gen.ts",
		"dist",
		"test/purity/violation.ts",
	]),
]);
