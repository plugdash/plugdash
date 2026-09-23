// Pure helpers for the RedirectPage companion component.
// Extracted so they can be unit-tested without an Astro runtime.

export type ResolveDecision =
	| { kind: "redirect"; target: string }
	| { kind: "expired" }
	| { kind: "not_found" };

/**
 * Maps the JSON response from the `resolve` plugin route into a redirect
 * decision. Tolerant of malformed input: anything unrecognised becomes
 * `not_found`.
 */
export function interpretResolveResponse(data: unknown): ResolveDecision {
	if (data === null || typeof data !== "object") {
		return { kind: "not_found" };
	}
	const d = data as Record<string, unknown>;

	if (typeof d.target === "string" && d.target.length > 0) {
		return { kind: "redirect", target: d.target };
	}
	if (d.expired === true) {
		return { kind: "expired" };
	}
	return { kind: "not_found" };
}

/**
 * Single source of truth for what a short code may look like. Used by both
 * the admin `create_shortlink` form (sandbox-entry.ts) and the redirect
 * lookup path (validateCode below) so the two can never drift apart - a
 * code accepted at creation time must always resolve at redirect time.
 * Alphanumeric and hyphens, at least one alphanumeric character, max 64.
 */
const CODE_PATTERN = /^(?=.*[a-zA-Z0-9])[a-zA-Z0-9-]{1,64}$/;

export function isValidCode(code: string): boolean {
	return CODE_PATTERN.test(code);
}

/**
 * Validates a short code extracted from the URL path.
 * Returns null for invalid input (missing, empty, disallowed characters, too long).
 */
export function validateCode(code: unknown): string | null {
	if (typeof code !== "string") return null;
	if (!isValidCode(code)) return null;
	return code;
}

/**
 * Builds the URL for the shortlink resolve plugin route. The origin comes
 * from the caller so this function stays pure and testable.
 */
export function buildResolveUrl(origin: string, code: string): string {
	return `${origin}/_emdash/api/plugins/shortlink/resolve?code=${encodeURIComponent(code)}`;
}
