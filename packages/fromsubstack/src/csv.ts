// Minimal RFC 4180 CSV reader for Substack's posts.csv.
//
// Substack titles and subtitles routinely contain commas, quotes and the odd
// newline, so a split(",") would shred them. This is the whole spec that
// matters: quoted fields, "" as an escaped quote, embedded commas/newlines,
// and CRLF or LF line endings.

/** Splits CSV text into rows of raw cell values. */
export function parseCsvRows(text: string): string[][] {
	const input = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
	const rows: string[][] = [];
	let row: string[] = [];
	let field = "";
	let quoted = false;

	for (let i = 0; i < input.length; i++) {
		const ch = input[i]!;

		if (quoted) {
			if (ch === '"') {
				if (input[i + 1] === '"') {
					field += '"';
					i++;
					continue;
				}
				quoted = false;
				continue;
			}
			// Normalise CRLF inside a quoted field to a plain newline.
			if (ch === "\r" && input[i + 1] === "\n") continue;
			field += ch;
			continue;
		}

		if (ch === '"') {
			quoted = true;
			continue;
		}
		if (ch === ",") {
			row.push(field);
			field = "";
			continue;
		}
		if (ch === "\r") continue;
		if (ch === "\n") {
			row.push(field);
			rows.push(row);
			row = [];
			field = "";
			continue;
		}
		field += ch;
	}

	if (field.length > 0 || row.length > 0) {
		row.push(field);
		rows.push(row);
	}

	return rows;
}

/**
 * Parses CSV text into records keyed by the header row. Blank lines are
 * dropped, and short rows get empty strings for the missing columns.
 */
export function parseCsv(text: string): Array<Record<string, string>> {
	const rows = parseCsvRows(text).filter((r) => r.some((c) => c.trim() !== ""));
	const header = rows.shift();
	if (!header) return [];
	const keys = header.map((h) => h.trim());
	return rows.map((r) =>
		Object.fromEntries(keys.map((key, i) => [key, r[i] ?? ""])),
	);
}
