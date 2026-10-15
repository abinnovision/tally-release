import type { Format, Paint } from "./paint.js";

export interface ColumnOptions {
	indent?: number;
	styles?: readonly (Format | undefined)[];
}

/**
 * Pads cells to aligned columns; widths come from the plain text, styles apply
 * per cell. Columns that are empty in every row are dropped.
 */
export const alignColumns = (
	rows: readonly (readonly string[])[],
	opts: ColumnOptions = {},
	paint: Paint = (_format, text) => text,
): string[] => {
	const widths: number[] = [];
	for (const row of rows) {
		row.forEach((cell, i) => {
			widths[i] = Math.max(widths[i] ?? 0, cell.length);
		});
	}

	const indent = " ".repeat(opts.indent ?? 0);

	return rows.map((row) => {
		const cells = [...row];
		while (cells.at(-1) === "") {
			cells.pop();
		}

		return (
			indent +
			cells
				.map((cell, i) => {
					if (widths[i] === 0) {
						return undefined;
					}

					const style = opts.styles?.[i];
					const text = style && cell !== "" ? paint(style, cell) : cell;
					const pad =
						i === cells.length - 1 ? 0 : (widths[i] ?? 0) - cell.length;

					return text + " ".repeat(pad);
				})
				.filter((cell) => cell !== undefined)
				.join("  ")
		);
	});
};
