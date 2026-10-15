import { defineProject } from "vitest/config";

export default defineProject({
	test: {
		name: "@tallyrelease/cli#unit",
		include: ["src/**/*.spec.ts"],
		environment: "node",
	},
});
