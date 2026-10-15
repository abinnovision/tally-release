import { Octokit } from "@octokit/rest";

import type { Forge } from "./forge.js";

export interface GithubForgeOptions {
	token: string;
	/** `GITHUB_API_URL`, defaults to the public API. */
	baseUrl?: string | undefined;
}

/** `Forge` backed by the GitHub REST API. */
export const githubForge = (opts: GithubForgeOptions): Forge => {
	const octokit = new Octokit({
		auth: opts.token,
		baseUrl: opts.baseUrl ?? "https://api.github.com",
	});

	return {
		lastSuccessfulPushRuns: async ({ owner, repo, workflow, branch }) => {
			try {
				const { data } = await octokit.rest.actions.listWorkflowRuns({
					owner,
					repo,
					workflow_id: workflow,
					branch,
					status: "success",
					event: "push",
					per_page: 100,
				});

				return data.workflow_runs.map((run) => run.head_sha);
			} catch (error) {
				// A renamed or deleted workflow has no runs to build on.
				if ((error as { status?: unknown }).status === 404) {
					return [];
				}

				throw error;
			}
		},
	};
};
