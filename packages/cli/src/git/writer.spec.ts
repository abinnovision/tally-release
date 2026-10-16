import { describe, expect, it } from "vitest";

import { RELEASE_IDENTITY, identityFromEnv } from "./writer.js";

describe("identityFromEnv", () => {
	it("defaults every field to the release identity", () => {
		const both = { author: RELEASE_IDENTITY, committer: RELEASE_IDENTITY };

		expect(identityFromEnv({})).toEqual(both);
		expect(
			identityFromEnv({ GIT_AUTHOR_NAME: "", GIT_COMMITTER_EMAIL: "" }),
		).toEqual(both);
	});

	it("uses the author for the committer and fields fall back alone", () => {
		const author = { name: "a", email: RELEASE_IDENTITY.email };

		expect(identityFromEnv({ GIT_AUTHOR_NAME: "a" })).toEqual({
			author,
			committer: author,
		});
	});

	it("reads author and committer", () => {
		expect(
			identityFromEnv({
				GIT_AUTHOR_NAME: "a",
				GIT_AUTHOR_EMAIL: "a@x",
				GIT_COMMITTER_NAME: "c",
				GIT_COMMITTER_EMAIL: "c@x",
			}),
		).toEqual({
			author: { name: "a", email: "a@x" },
			committer: { name: "c", email: "c@x" },
		});
	});
});
