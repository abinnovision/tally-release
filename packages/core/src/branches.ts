import { TallyError } from "./errors.js";

import type { BranchRule } from "./release.js";

const SPECIAL = /[\\^$.*+?()[\]{}|/]/gu;
const PART = /\{(major|minor)\}|\*/gu;
const CHANNEL = /^[0-9A-Za-z-]+$/u;

const ruleError = (rule: BranchRule, problem: string) =>
	new TallyError("E_BRANCH_RULE", `branch rule "${rule.name}" ${problem}`, {
		rule: rule.name,
	});

/** Anchored regex of a rule name; throws `E_BRANCH_RULE`. */
const compileRule = (rule: BranchRule): RegExp => {
	const { name } = rule;
	if (name === "") {
		throw ruleError(rule, "has an empty name");
	}

	const tokens: string[] = name.match(/\{[^{}]*\}/gu) ?? [];
	const unknown = tokens.find((t) => t !== "{major}" && t !== "{minor}");
	if (unknown !== undefined) {
		throw ruleError(rule, `uses unknown token ${unknown}`);
	}

	if (new Set(tokens).size !== tokens.length) {
		throw ruleError(rule, "repeats a token");
	}

	if (tokens.includes("{minor}") && !tokens.includes("{major}")) {
		throw ruleError(rule, "uses {minor} without {major}");
	}

	if (/[{}]/u.test(name.replace(PART, ""))) {
		throw ruleError(rule, "has an unbalanced brace");
	}

	let source = "";
	let last = 0;
	for (const match of name.matchAll(PART)) {
		source += name.slice(last, match.index).replace(SPECIAL, "\\$&");
		source += match[1] === undefined ? ".*" : `(?<${match[1]}>0|[1-9]\\d*)`;
		last = match.index + match[0].length;
	}

	source += name.slice(last).replace(SPECIAL, "\\$&");

	return new RegExp(`^${source}$`, "u");
};

/** The branch rule matching the planned branch. */
export interface Line {
	rule: string;
	kind: "default" | "maintenance";
	/** Rendered with the rule's captures. */
	channel: string | null;
	/** Maintenance rules: `minor` for `{major}`, `patch` with `{minor}`. */
	maxBump: "minor" | "patch" | null;
	absolute: {
		unit: string | null;
		group: string | null;
		major: number;
		minor?: number;
	} | null;
}

/**
 * Validates rule names and channels: `E_BRANCH_RULE`, `E_CHANNEL_WILDCARD`,
 * `E_CHANNEL_INVALID` and `E_CHANNEL_DUPLICATE`.
 */
export const validateBranches = (rules: readonly BranchRule[]): void => {
	const channels = new Map<string, string>();
	for (const rule of rules) {
		compileRule(rule);
		const { channel } = rule;
		if (channel === null) {
			continue;
		}

		if (rule.name.includes("*")) {
			throw new TallyError(
				"E_CHANNEL_WILDCARD",
				`branch rule "${rule.name}" contains * and cannot set a channel`,
				{ rule: rule.name, channel },
			);
		}

		const literal = channel.replace(/\{(major|minor)\}/gu, (token) =>
			rule.name.includes(token) ? "0" : token,
		);
		if (
			!CHANNEL.test(literal) ||
			!/[A-Za-z-]/u.test(channel.replace(/\{(major|minor)\}/gu, ""))
		) {
			throw new TallyError(
				"E_CHANNEL_INVALID",
				`channel "${channel}" of branch rule "${rule.name}" must match ${CHANNEL.source}, contain a letter or dash and use only tokens captured by the rule`,
				{ rule: rule.name, channel },
			);
		}

		const other = channels.get(channel);
		if (other !== undefined) {
			throw new TallyError(
				"E_CHANNEL_DUPLICATE",
				`channel "${channel}" is set by branch rules "${other}" and "${rule.name}"`,
				{ channel, rules: [other, rule.name] },
			);
		}

		channels.set(channel, rule.name);
	}
};

/** The first rule matching `branch`, or null. Rules must be validated. */
export const matchBranch = (
	rules: readonly BranchRule[],
	branch: string,
): Line | null => {
	for (const rule of rules) {
		const match = compileRule(rule).exec(branch);
		if (!match) {
			continue;
		}

		const captures: Record<string, string | undefined> = match.groups ?? {};
		const maintenance = rule.line === "maintenance";

		return {
			rule: rule.name,
			kind: rule.line,
			channel:
				rule.channel?.replace(
					/\{(major|minor)\}/gu,
					(_, token: string) => captures[token] ?? "",
				) ?? null,
			maxBump: !maintenance
				? null
				: captures["minor"] !== undefined
					? "patch"
					: captures["major"] !== undefined
						? "minor"
						: null,
			absolute: null,
		};
	}

	return null;
};
