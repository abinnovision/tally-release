/** Fatal error with a stable `E_*` code. */
export class TallyError extends Error {
	public override readonly name = "TallyError";
	public readonly code: string;
	public readonly details: Readonly<Record<string, unknown>>;

	public constructor(
		code: string,
		message: string,
		details: Record<string, unknown> = {},
	) {
		super(message);
		this.code = code;
		this.details = details;
	}
}

/** Non-fatal finding with a stable `W_*` code. */
export interface Warning {
	code: string;
	message: string;
	plugin?: string;
	/** The unit the warning concerns. */
	unit?: string;
}
