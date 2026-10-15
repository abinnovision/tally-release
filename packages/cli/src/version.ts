import { createRequire } from "node:module";

/**
 * Version from this package's `package.json`. Publishing stamps the released
 * version (e.g. `0.1.0-beta.5`) into it, so this matches the npm version.
 */
export const { version } = createRequire(import.meta.url)(
	"../package.json",
) as { version: string };
