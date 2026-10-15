// Writes JSON schemas generated from the built zod schemas into dist.
import { writeFileSync } from "node:fs";
import { z } from "zod";

import { affectedDocSchema } from "../dist/affected-schema.js";

writeFileSync(
	new URL("../dist/affected.schema.json", import.meta.url),
	`${JSON.stringify(z.toJSONSchema(affectedDocSchema), null, "\t")}\n`,
);
