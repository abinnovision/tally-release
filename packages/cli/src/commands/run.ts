import {
	computePlan,
	releasedFromTags,
	TallyError,
	withReleased,
} from "@tallyrelease/core";

import { effectSkipped } from "./effects.js";
import { planOptions, releasedPrs, writePlan } from "./plan.js";
import { releasePrs } from "./pr.js";
import { reconcile, withTags } from "./release.js";
import { releaseEntries } from "../ci/releases.js";

import type { Session } from "../session.js";
import type { PlanFlags, PlanSetup } from "./plan.js";

export interface RunFlags extends Pick<
	PlanFlags,
	"branch" | "base" | "out" | "githubOutput" | "summary"
> {
	dryRun?: boolean;
}

/**
 * CI entry point: reconciles merged release PRs, plans HEAD with `released`
 * united with the tags reconciled in this run, updates the release PRs and
 * writes the plan outputs.
 */
export const run = async (session: Session, flags: RunFlags): Promise<void> => {
	if (effectSkipped(session, "run")) {
		return;
	}

	const branch = flags.branch === undefined ? {} : { branch: flags.branch };
	const state: { setup?: PlanSetup } = {};
	const reconciled = await reconcile(
		session,
		{ ...branch, ...(flags.dryRun && { dryRun: true }) },
		{
			command: "run",
			// The base is required before any effect, so a failing run changes nothing.
			ready: async () => {
				const setup = await planOptions(session, {
					...branch,
					...(flags.base !== undefined && { base: flags.base }),
				});
				const { base, warnings } = setup.base;
				if (base === null && warnings.some((w) => w.code === "W_FORGE_ERROR")) {
					throw new TallyError(
						"E_BASE_REQUIRED",
						`the build base is unknown because the forge failed (${warnings.map((w) => w.message).join("; ")}); re-run when the forge is healthy`,
					);
				}

				state.setup = setup;
			},
		},
	);
	const { setup } = state;
	if (reconciled === undefined || setup === undefined) {
		return;
	}

	// A warning repeated by a later step prints once.
	const seen = new Set<string>();
	const warn: Session["warn"] = (warnings) => {
		session.warn(
			warnings.filter((w) => {
				const key = JSON.stringify([w.code, w.plugin, w.message]);
				const fresh = !seen.has(key);
				seen.add(key);

				return fresh;
			}),
		);
	};

	// Dry-run tags exist only in memory; later steps see them through `git`.
	const git = flags.dryRun
		? withTags(
				session.git,
				new Map(reconciled.flatMap((r) => r.tags.map((t) => [t, r.sha]))),
			)
		: session.git;
	const runSession: Session = { ...session, git, warn };
	const { base } = setup;

	const planned = await session.workspaceAt(null, async (workspace, fs) => {
		const atHead = await withReleased(
			workspace,
			await computePlan(workspace, git, { ...setup.opts, fs, all: false }),
			{ git },
		);
		const tags = [
			...atHead.released.map((r) => r.tag),
			...reconciled.flatMap((r) => r.tags),
		];

		return {
			plan: {
				...atHead,
				released: await releasedFromTags(workspace, atHead, { git, tags }),
			},
			units: workspace.units,
		};
	});
	const known = new Map(
		reconciled.flatMap((r) => r.tags.map((t) => [t, r.number])),
	);
	const doc = {
		...planned.plan,
		released: await releasedPrs(runSession, planned.plan.released, known),
		warnings: [...planned.plan.warnings, ...setup.warnings],
	};
	warn(doc.warnings);

	await releasePrs(
		runSession,
		{ ...branch, ...(flags.dryRun && { dryRun: true }) },
		{ reconciled: new Set(reconciled.map((r) => r.number)) },
	);

	writePlan(
		runSession,
		{ doc, base, releases: releaseEntries(doc, planned.units) },
		flags,
	);
};
