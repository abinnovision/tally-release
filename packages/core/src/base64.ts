const ALPHABET =
	"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const BASE64 =
	/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u;

/** UTF-8 bytes of `text`; throws on lone surrogates. */
const utf8 = (text: string): number[] =>
	[...encodeURIComponent(text).matchAll(/%([0-9A-F]{2})|[^%]/gu)].map(
		([char, hex]) =>
			hex === undefined ? char.charCodeAt(0) : parseInt(hex, 16),
	);

/** Standard padded base64 of the UTF-8 encoding of `text`. */
export const encodeBase64 = (text: string): string => {
	const bytes = utf8(text);
	let out = "";
	for (let i = 0; i < bytes.length; i += 3) {
		const [a = 0, b = 0, c = 0] = bytes.slice(i, i + 3);
		const n = a * 65536 + b * 256 + c;
		const chars = [18, 12, 6, 0].map(
			(s) => ALPHABET[Math.floor(n / 2 ** s) % 64],
		);
		const pad = 3 - Math.min(3, bytes.length - i);
		out += chars.slice(0, 4 - pad).join("") + "=".repeat(pad);
	}

	return out;
};

/** Text of padded base64 holding UTF-8; undefined when either is malformed. */
export const decodeBase64 = (data: string): string | undefined => {
	if (!BASE64.test(data)) {
		return undefined;
	}

	let hex = "";
	for (let i = 0; i < data.length; i += 4) {
		const quad = data.slice(i, i + 4);
		const pad = quad.length - quad.replace(/=+$/u, "").length;
		const n = Array.from({ length: 4 }, (_, k) => quad.charAt(k)).reduce(
			(acc, char) => acc * 64 + Math.max(0, ALPHABET.indexOf(char)),
			0,
		);
		const bytes = [16, 8, 0].map((s) => Math.floor(n / 2 ** s) % 256);
		hex += bytes
			.slice(0, 3 - pad)
			.map((b) => `%${b.toString(16).padStart(2, "0")}`)
			.join("");
	}

	try {
		return decodeURIComponent(hex);
	} catch {
		return undefined;
	}
};
