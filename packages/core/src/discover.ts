import { TallyError } from "./errors.js";
import { defaultUnitId } from "./plugin.js";
import { runHook } from "./plugins.js";
import { compare, uniqueSorted } from "./util.js";

import type { Unit, UnitDraft } from "./plugin.js";
import type { ActivePlugin, PluginEnv } from "./plugins.js";

const UNIT_ID = /^(?!\.\.?$)[A-Za-z0-9._-]+$/;
const UNIT_TAG = /^[A-Za-z0-9._-]+$/;

interface Entry {
	plugin: string;
	draft: Omit<UnitDraft, "meta">;
	meta: Record<string, Readonly<Record<string, unknown>>>;
	/** From the config overlay only. */
	release?: boolean | undefined;
	/** From the config overlay only. */
	tags?: string[] | undefined;
}

/** Drops `.` and empty segments; rejects absolute roots and `..` segments. */
const normalizeRoot = (root: string): string => {
	const segments = root.split("/");
	if (root.startsWith("/") || segments.includes("..")) {
		throw new TallyError(
			"E_ROOT_INVALID",
			`root "${root}" must be repo-relative without ".." segments`,
			{ root },
		);
	}

	return segments.filter((s) => s !== "" && s !== ".").join("/") || ".";
};

/** Escapes glob metacharacters so a root matches literally. */
const escapeGlob = (path: string): string =>
	path.replace(/[[\]{}()!*?+@\\]/g, "\\$&");

const isInside = (path: string, root: string): boolean =>
	path !== root && (root === "." || path.startsWith(`${root}/`));

/**
 * Runs `discover` hooks in config order, applies config overlays and fills
 * defaults. Returns units sorted by id.
 */
export const discoverUnits = async (
	active: readonly ActivePlugin[],
	env: Pick<PluginEnv, "config" | "fs" | "repo">,
): Promise<Unit[]> => {
	const byRoot = new Map<string, Entry>();

	for (const { plugin, ctx } of active) {
		const discover = plugin.discover?.bind(plugin);
		if (!discover) {
			continue;
		}

		// eslint-disable-next-line no-await-in-loop -- hooks run sequentially in config order
		const drafts = await runHook(plugin.name, "discover", () => discover(ctx));
		for (const { meta, ...draft } of drafts) {
			const root = normalizeRoot(draft.root);
			const prior = byRoot.get(root);
			if (prior) {
				throw new TallyError(
					"E_DUPLICATE_ROOT",
					`root "${root}" is discovered by "${prior.plugin}" and "${plugin.name}"`,
					{ root, plugins: [prior.plugin, plugin.name] },
				);
			}

			byRoot.set(root, {
				plugin: plugin.name,
				draft: { ...draft, root },
				meta: meta ? { [plugin.name]: Object.freeze({ ...meta }) } : {},
			});
		}
	}

	for (const [key, { release, tags, ...overlay }] of Object.entries(
		env.config.units ?? {},
	)) {
		const root = normalizeRoot(key);
		const invalid = tags?.find((t) => !UNIT_TAG.test(t));
		if (invalid !== undefined) {
			throw new TallyError(
				"E_UNIT_TAG",
				`tag "${invalid}" of unit at "${root}" must match ${UNIT_TAG.source}`,
				{ tag: invalid, root },
			);
		}

		const entry = byRoot.get(root);
		if (entry) {
			entry.draft = { ...entry.draft, ...overlay };
			entry.release = release;
			entry.tags = tags;
		} else {
			byRoot.set(root, {
				plugin: "config",
				draft: {
					...overlay,
					id: overlay.id ?? defaultUnitId(root, env.repo.name),
					root,
				},
				meta: {},
				release,
				tags,
			});
		}
	}

	const byId = new Map<string, Entry>();
	for (const entry of byRoot.values()) {
		const { id, root } = entry.draft;
		if (!UNIT_ID.test(id)) {
			throw new TallyError(
				"E_UNIT_ID",
				`unit id "${id}" at "${root}" must match ${UNIT_ID.source}`,
				{ id, root, plugin: entry.plugin },
			);
		}

		const prior = byId.get(id);
		if (prior) {
			throw new TallyError(
				"E_DUPLICATE_UNIT",
				`unit id "${id}" is used by "${prior.plugin}" at "${prior.draft.root}" and "${entry.plugin}" at "${root}"`,
				{
					id,
					owners: [
						{ plugin: prior.plugin, root: prior.draft.root },
						{ plugin: entry.plugin, root },
					],
				},
			);
		}

		byId.set(id, entry);
		if (root !== "." && !env.fs.exists(root)) {
			throw new TallyError(
				"E_ROOT_MISSING",
				`root "${root}" of unit "${id}" does not exist`,
				{ id, root },
			);
		}
	}

	const roots = [...byRoot.keys()].sort(compare);
	const { defaults } = env.config;

	return [...byId.values()]
		.map(({ plugin, draft, meta, release, tags }): Unit => {
			const { root } = draft;
			const nested = roots
				.filter((r) => isInside(r, root))
				.map((r) => `${escapeGlob(r)}/**`);

			return Object.freeze({
				id: draft.id,
				root,
				plugin,
				include: Object.freeze([
					...(draft.include ?? [
						root === "." ? "**" : `${escapeGlob(root)}/**`,
					]),
				]),
				exclude: Object.freeze([...nested, ...(draft.exclude ?? [])]),
				version:
					(release ?? defaults?.release ?? false)
						? (draft.version ?? "tag")
						: "none",
				scheme: draft.scheme ?? "semver",
				tagFormat:
					draft.tagFormat ??
					defaults?.tagFormat ??
					(root === "." ? "v{version}" : "{id}-v{version}"),
				propagate: draft.propagate ?? defaults?.propagate ?? "auto",
				tags: Object.freeze(uniqueSorted(tags ?? [])),
				meta: Object.freeze(meta),
			});
		})
		.sort((a, b) => compare(a.id, b.id));
};
