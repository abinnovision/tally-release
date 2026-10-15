import type { BumpLevel, PreCtx, VersionScheme } from "../../src/index.js";

/** Flutter `x.y.z+build` scheme from design A.5, typed against public exports only. */
interface FlutterVersion {
	major: number;
	minor: number;
	patch: number;
	build: number;
}

const RE = /^(\d+)\.(\d+)\.(\d+)\+(\d+)$/u;

const bumpCore = (v: FlutterVersion, level: BumpLevel): FlutterVersion => {
	switch (level) {
		case "major":
			return { ...v, major: v.major + 1, minor: 0, patch: 0 };
		case "minor":
			return { ...v, minor: v.minor + 1, patch: 0 };
		case "patch":
			return { ...v, patch: v.patch + 1 };
	}
};

const parse = (raw: string): FlutterVersion | undefined => {
	const m = RE.exec(raw);

	return m
		? {
				major: Number(m[1]),
				minor: Number(m[2]),
				patch: Number(m[3]),
				build: Number(m[4]),
			}
		: undefined;
};

const buildNo = (ctx: PreCtx): number => {
	const tagged = ctx.tags.map(
		(t) => parse(t.replace(/^.*?(?=\d)/u, ""))?.build ?? 0,
	);
	const offset = Number(ctx.unit.meta["dart"]?.["buildOffset"] ?? 0);

	return Math.max(ctx.firstParent.total + offset, Math.max(0, ...tagged) + 1);
};

export const flutter: VersionScheme<FlutterVersion> = {
	parse,
	format: (v) => `${[v.major, v.minor, v.patch].join(".")}+${String(v.build)}`,
	compare: (a, b) =>
		a.major - b.major ||
		a.minor - b.minor ||
		a.patch - b.patch ||
		a.build - b.build,
	core: ({ major, minor, patch }) => ({ major, minor, patch }),
	isPrerelease: () => false,
	initial: () => ({ major: 0, minor: 1, patch: 0, build: 0 }),
	bump: (v, level) => bumpCore(v, level),
	release: (next, ctx) => ({ ...next, build: buildNo(ctx) }),
	prerelease: (next, ctx) => ({ ...next, build: buildNo(ctx) }),
};
