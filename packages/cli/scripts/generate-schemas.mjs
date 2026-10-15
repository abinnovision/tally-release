// Writes JSON schemas generated from the built zod schemas into dist.
import { writeFileSync } from "node:fs";
import { z } from "zod";

import { affectedDocSchema } from "../dist/affected-schema.js";
import { configJsonSchema } from "../dist/config/schema.js";

writeFileSync(
	new URL("../dist/affected.schema.json", import.meta.url),
	`${JSON.stringify(z.toJSONSchema(affectedDocSchema), null, "\t")}\n`,
);

writeFileSync(
	new URL("../dist/tallyrelease.schema.json", import.meta.url),
	`${JSON.stringify(configJsonSchema(), null, "\t")}\n`,
);
