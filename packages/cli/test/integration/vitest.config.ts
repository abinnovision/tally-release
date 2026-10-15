import { defineProject } from "vitest/config";

export default defineProject({
	test: {
		name: "@tallyrelease/cli#integration",
		include: ["test/integration/**/*.integration-spec.ts"],
		environment: "node",
		maxConcurrency: 1,
	},
});
