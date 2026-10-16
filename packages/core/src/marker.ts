import { decodeBase64, encodeBase64 } from "./base64.js";

const MARKER = /<!-- tallyrelease-plan:v1 ([A-Za-z0-9+/=]*) -->/u;

const isRelease = (value: unknown): value is MarkerRelease => {
	const r = value as Partial<Record<keyof MarkerRelease, unknown>> | null;

	return (
		typeof r === "object" &&
		r !== null &&
		typeof r.id === "string" &&
		typeof r.version === "string" &&
		typeof r.tag === "string"
	);
};

/** A release recorded in a release PR marker. */
export interface MarkerRelease {
	id: string;
	version: string;
	tag: string;
}

/** Release PR marker, version 1. */
export interface Marker {
	/** Line head the release commit was built on. */
	head: string;
	releaseCommit: string;
	releases: MarkerRelease[];
}

/** `<!-- tallyrelease-plan:v1 <base64 json> -->` holding only the marker fields. */
export const encodeMarker = ({
	head,
	releaseCommit,
	releases,
}: Marker): string => {
	const json = JSON.stringify({
		head,
		releaseCommit,
		releases: releases.map(({ id, version, tag }) => ({ id, version, tag })),
	});

	return `<!-- tallyrelease-plan:v1 ${encodeBase64(json)} -->`;
};

/** The marker in a PR body; undefined when missing or malformed. */
export const decodeMarker = (body: string): Marker | undefined => {
	const data = MARKER.exec(body)?.[1];
	const json = data === undefined ? undefined : decodeBase64(data);
	if (json === undefined) {
		return undefined;
	}

	let value: unknown;
	try {
		value = JSON.parse(json);
	} catch {
		return undefined;
	}

	const m = value as Partial<Record<keyof Marker, unknown>> | null;
	if (
		typeof m !== "object" ||
		m === null ||
		typeof m.head !== "string" ||
		typeof m.releaseCommit !== "string" ||
		!Array.isArray(m.releases) ||
		!m.releases.every(isRelease)
	) {
		return undefined;
	}

	return {
		head: m.head,
		releaseCommit: m.releaseCommit,
		releases: m.releases.map(({ id, version, tag }) => ({ id, version, tag })),
	};
};
