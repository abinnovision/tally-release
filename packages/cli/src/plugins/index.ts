import { nodePlugin } from "./node/index.js";
import { phpPlugin } from "./php/index.js";

import type { Plugin } from "@tallyrelease/core";

export const builtinPlugins: Record<string, Plugin> = {
	node: nodePlugin,
	php: phpPlugin,
};
