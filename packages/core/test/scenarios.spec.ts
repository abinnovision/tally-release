import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

import { flutter } from "./fixtures/flutter.js";
import { collectPlanFacts } from "../src/facts.js";
import { computeAffected, loadWorkspace } from "../src/index.js";
import { memoryFs, memoryGit } from "../src/testing.js";

import type {
	Change,
	EdgeDraft,
	Plugin,
	TallyConfig,
	UnitDraft,
} from "../src/index.js";
import type { Dag } from "../src/testing.js";
import type { StandardSchemaV1 } from "@standard-schema/spec";

/** Declarative plugin stub; every hook resolves asynchronously. */
interface Stub {
	name: string;
	apiVersion?: number;
	units?: UnitDraft[];
	edges?: EdgeDraft[];
	inputs?: string[];
	/** Accepted option keys; any other key is a validation issue. */
	optionKeys?: string[];
	throws?: "discover" | "edges" | "inputs";
	schemes?: (keyof typeof SCHEMES)[];
	/** Returned by an intent source for every range. */
	changes?: Change[];
}

const SCHEMES = { flutter };

interface Scenario {
	description: string;
	repo?: string;
	plugins?: Stub[];
	/** `plugins` defaults to every stub with empty options. */
	config?: TallyConfig;
	/** Passed as `loadWorkspace({ configFile })`. */
	configFile?: string;
	git: Dag;
	base: string | null;
	/** Defaults to the last commit. */
	head?: string;
	/** Defaults to `main`. */
	branch?: string;
	/** Collects plan facts when set. */
	plan?: Record<string, never>;
	expect?: Record<string, unknown>;
	error?: { code: string; details?: Record<string, unknown> };
}

const keysSchema = (
	keys: string[],
): StandardSchemaV1<unknown, Record<string, unknown>> => ({
	"~standard": {
		version: 1,
		vendor: "scenario",
		validate: (value) => {
			const options = value as Record<string, unknown>;
			const unknown = Object.keys(options).filter((k) => !keys.includes(k));

			return unknown.length > 0
				? { issues: unknown.map((k) => ({ message: `unknown option "${k}"` })) }
				: { value: options };
		},
	},
});

const stubPlugin = (stub: Stub): Plugin => {
	const hook =
		<T>(name: NonNullable<Stub["throws"]>, value: T) =>
		async (): Promise<T> => {
			if (stub.throws === name) {
				throw new Error(`${name} failed`);
			}

			return await Promise.resolve(value);
		};

	return {
		apiVersion: stub.apiVersion as 1,
		name: stub.name,
		...(stub.optionKeys && { options: keysSchema(stub.optionKeys) }),
		discover: hook("discover", stub.units ?? []),
		edges: hook("edges", stub.edges ?? []),
		inputs: hook("inputs", { global: stub.inputs ?? [] }),
		...(stub.schemes && {
			schemes: Object.fromEntries(stub.schemes.map((n) => [n, SCHEMES[n]])),
		}),
		...(stub.changes && {
			intent: [{ name: "stub", collect: () => stub.changes ?? [] }],
		}),
	};
};

const run = async (s: Scenario) => {
	const stubs = (s.plugins ?? []).map((p) => ({ apiVersion: 1, ...p }));
	const git = memoryGit(s.git);
	const head = s.head ?? s.git.commits.at(-1)?.id ?? "HEAD";
	const fs = memoryFs(git.tree(head));
	const workspace = await loadWorkspace({
		config: s.config ?? {
			plugins: Object.fromEntries(stubs.map((p) => [p.name, {}])),
		},
		plugins: stubs.map(stubPlugin),
		fs,
		repo: { name: s.repo ?? "demo" },
		...(s.configFile !== undefined && { configFile: s.configFile }),
	});
	const affected = await computeAffected(workspace, git, {
		tool: "tallyrelease@test",
		branch: s.branch ?? "main",
		head,
		base: s.base,
		baseSource: s.base === null ? "none" : "cli",
	});

	const facts = s.plan
		? await collectPlanFacts(workspace, git, { head, fs })
		: undefined;

	return {
		units: workspace.units,
		edges: workspace.graph.edges,
		order: workspace.graph.order,
		affected,
		facts,
	};
};

const dir = join(import.meta.dirname, "scenarios");
const cases = readdirSync(dir)
	.filter((f) => f.endsWith(".yaml"))
	.map((file) => {
		const scenario = parse(readFileSync(join(dir, file), "utf8")) as Scenario;
		const expected = scenario.error
			? { error: scenario.error }
			: { value: scenario.expect ?? {} };

		return {
			name: `${file.replace(/\.yaml$/, "")}: ${scenario.description}`,
			scenario,
			expected,
		};
	});

describe("scenarios", () => {
	for (const { name, scenario, expected } of cases) {
		it(name, async () => {
			const outcome = await run(scenario).then(
				(value) => ({ value }),
				(error: unknown) => ({ error }),
			);
			expect(outcome).toMatchObject(expected);
		});
	}
});
