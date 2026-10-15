import type { Forge, WorkflowRunQuery } from "../../../src/index.js";

/** `Forge` serving canned successful run head shas; records queries. */
export const fakeForge = (
	runs: string[] = [],
): Forge & { queries: WorkflowRunQuery[] } => {
	const queries: WorkflowRunQuery[] = [];

	return {
		queries,
		lastSuccessfulPushRuns: async (query) => {
			queries.push(query);

			return await Promise.resolve(runs);
		},
	};
};
