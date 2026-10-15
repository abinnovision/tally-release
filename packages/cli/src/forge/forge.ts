export interface WorkflowRunQuery {
	owner: string;
	repo: string;
	/** Workflow file name, for example `ci.yaml`. */
	workflow: string;
	branch: string;
}

/** Code host API used by the cli. */
export interface Forge {
	/** Head shas of successful push runs of a workflow on a branch, newest first. */
	lastSuccessfulPushRuns: (query: WorkflowRunQuery) => Promise<string[]>;
}
