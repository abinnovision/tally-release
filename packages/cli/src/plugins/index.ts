import { kustomizePlugin } from "./kustomize/index.js";
import { nodePlugin } from "./node/index.js";
import { phpPlugin } from "./php/index.js";

import type { Plugin } from "@tallyrelease/core";

export const builtinPlugins: Record<string, Plugin<any>> = {
	node: nodePlugin,
	php: phpPlugin,
	kustomize: kustomizePlugin,
};
