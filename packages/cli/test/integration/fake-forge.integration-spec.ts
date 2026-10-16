import { describe, expect, it } from "vitest";

import {
	fakeForge,
	fakeGitWriter,
	memoryRemote,
	mergePr,
} from "./harness/fake-forge.js";
import { memoryRepo } from "./harness/memory-repo.js";

import type { Dag } from "@tallyrelease/core/testing";

describe("fake forge and writer", () => {
	it("share one remote through commit, push, PR, merge and tag", async () => {
		const remote = memoryRemote();
		const forge = fakeForge([], remote);
		const writer = fakeGitWriter(remote);
		const repo = { owner: "acme", repo: "repo" };
		const branch = "tallyrelease/release/main/shared";
		const lease = { leases: { [`refs/heads/${branch}`]: "" } };
		const dag: Dag = { commits: [{ id: "c0", files: { "a.txt": "0" } }] };
		const commit = async () =>
			await writer.commitFiles({
				parent: "c0",
				files: new Map([["a.txt", "1"]]),
				message: "chore(release): a@1.0.0",
				date: "2024-01-01T00:00:00Z",
			});

		const sha = await commit();
		expect(await commit()).toBe(sha);
		await writer.push([`${sha}:refs/heads/${branch}`], lease);
		await expect(
			writer.push([`${sha}:refs/heads/${branch}`], lease),
		).rejects.toMatchObject({ code: "E_PUSH_LEASE" });
		const number = await forge.createPr(repo, {
			head: branch,
			base: "main",
			title: "chore(release): a@1.0.0",
			body: "",
		});
		await forge.setLabel(repo, number, { label: "tallyrelease: pending" });
		expect(
			await forge.releasePrs(repo, { base: "main", state: "open" }),
		).toMatchObject([{ number, headSha: sha }]);

		await expect(
			forge.createPr(repo, {
				head: branch,
				base: "main",
				title: "t",
				body: "",
			}),
		).rejects.toMatchObject({ status: 422 });

		const mergedDag = mergePr(dag, remote, number);
		const merged = memoryRepo(mergedDag, [remote.tags, writer.tags]);
		await writer.tag("a-v1.0.0", "merge-1");
		expect(merged.fs.read("a.txt")).toBe("1");
		expect(await merged.git.tagsMerged("HEAD")).toEqual([
			{ name: "a-v1.0.0", sha: "merge-1" },
		]);
		// Unpushed tags of a failed run are not seen by the next run.
		expect(await memoryRepo(mergedDag, [remote.tags]).git.tags()).toEqual([]);
		await writer.push(["refs/tags/a-v1.0.0"]);
		expect(await memoryRepo(mergedDag, [remote.tags]).git.tags()).toEqual([
			{ name: "a-v1.0.0", sha: "merge-1" },
		]);
		expect(
			await forge.releasePrs(repo, { base: "main", state: "merged" }),
		).toMatchObject([{ number, mergeCommitSha: "merge-1" }]);
		expect(remote.calls.map(([method]) => method)).toEqual([
			"push",
			"push",
			"createPr",
			"setLabel",
			"createPr",
			"push",
		]);
	});
});
