import { describe, expect, it } from "vitest";

import { alignColumns } from "./columns.js";

describe("alignColumns", () => {
	it("pads all but the last column and drops trailing empty cells", () => {
		expect(
			alignColumns(
				[
					["a", "long", "x"],
					["bbb", "c", ""],
				],
				{ indent: 2 },
			),
		).toEqual(["  a    long  x", "  bbb  c"]);
	});

	it("drops columns that are empty in every row", () => {
		expect(
			alignColumns([
				["a", "", "x"],
				["bb", "", ""],
			]),
		).toEqual(["a   x", "bb"]);
	});

	it("styles cells after measuring the plain text", () => {
		expect(
			alignColumns(
				[
					["a", "x"],
					["bb", "y"],
				],
				{ styles: ["bold"] },
				(format, text) => `<${String(format)}>${text}</>`,
			),
		).toEqual(["<bold>a</>   x", "<bold>bb</>  y"]);
	});
});
