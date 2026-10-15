// Deliberate node builtin import: check-purity must reject this entry.
import { readFileSync } from "node:fs";

export const read = (path: string) => readFileSync(path, "utf8");
