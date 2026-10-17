import type { ReleaseEntry } from "../plan-schema.js";
import type { Plan, Workspace } from "@tallyrelease/core";

/**
 * Releases first (`plan.released` order), then the prereleases in plan unit
 * order, none for a unit released at HEAD. A release lists the unit's changes
 * in `atParent`, the plan units at the first parent of each release sha.
 */
export const releaseEntries = (
	plan: Plan,
	{ units, groups }: Pick<Workspace, "units" | "groups">,
	atParent: ReadonlyMap<string, Plan["units"]>,
): ReleaseEntry[] => {
	const tags = new Map(units.map((u) => [u.id, [...u.tags]]));
	const group = new Map(
		groups.flatMap((g) => g.members.map((id) => [id, g.name])),
	);
	// Null when text follows `{version}`: the git rule needs a plain prefix.
	const prefix = new Map(
		units.map((u) => {
			const [head = "", tail = ""] = u.tagFormat.split("{version}");

			return [u.id, tail === "" ? head.replaceAll("{id}", u.id) : null];
		}),
	);
	const line = plan.line?.kind ?? "default";
	const atHead = new Set(
		plan.released.filter((r) => r.releaseSha === plan.head).map((r) => r.id),
	);

	return [
		...plan.released.map((r): ReleaseEntry => ({
			id: r.id,
			path: r.path,
			kind: "release",
			version: r.version,
			channel: null,
			tag: r.tag,
			tagPrefix: prefix.get(r.id) ?? null,
			sha: r.releaseSha,
			releaseSha: r.releaseSha,
			catchUp: r.catchUp,
			pr: r.pr,
			line: r.line,
			latest: r.latest,
			changes:
				atParent.get(r.releaseSha)?.find((u) => u.id === r.id)?.changes ?? [],
			tags: tags.get(r.id) ?? [],
			group: group.get(r.id) ?? null,
		})),
		...plan.units.flatMap((u): ReleaseEntry[] =>
			u.kind === "prerelease" && u.version !== null && !atHead.has(u.id)
				? [
						{
							id: u.id,
							path: u.path,
							kind: "prerelease",
							version: u.version,
							channel: plan.line?.channel ?? null,
							tag: null,
							tagPrefix: null,
							sha: plan.head,
							releaseSha: plan.head,
							catchUp: false,
							pr: null,
							line,
							latest: false,
							changes: u.changes,
							tags: u.tags,
							group: u.group,
						},
					]
				: [],
		),
	];
};
