import { defineProject } from "vitest/config";

export default defineProject({
	test: {
		name: "@tallyrelease/core#unit",
		include: ["src/**/*.spec.ts", "test/**/*.spec.ts"],
		environment: "node",
	},
});
