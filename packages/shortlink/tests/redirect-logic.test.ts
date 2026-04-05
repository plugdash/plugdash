import { describe, it, expect } from "vitest";
import {
	interpretResolveResponse,
	validateCode,
	buildResolveUrl,
} from "../src/redirect-logic.ts";

describe("interpretResolveResponse", () => {
	it("maps a valid target string to a redirect decision", () => {
		const result = interpretResolveResponse({
			target: "/posts/my-slug",
			code: "abc1",
		});
		expect(result).toEqual({ kind: "redirect", target: "/posts/my-slug" });
	});

	it("treats empty target string as not_found", () => {
		const result = interpretResolveResponse({ target: "", code: "abc1" });
		expect(result).toEqual({ kind: "not_found" });
	});

	it("maps expired: true to an expired decision", () => {
		const result = interpretResolveResponse({ expired: true, code: "abc1" });
		expect(result).toEqual({ kind: "expired" });
	});

	it("redirect wins over expired when both are present", () => {
		// The resolve route never returns both, but be defensive.
		const result = interpretResolveResponse({
			target: "/x",
			expired: true,
		});
		expect(result).toEqual({ kind: "redirect", target: "/x" });
	});

	it("maps {error: not_found} to not_found", () => {
		const result = interpretResolveResponse({ error: "not_found" });
		expect(result).toEqual({ kind: "not_found" });
	});

	it("maps {error: missing_code} to not_found", () => {
		const result = interpretResolveResponse({ error: "missing_code" });
		expect(result).toEqual({ kind: "not_found" });
	});

	it("treats null as not_found", () => {
		expect(interpretResolveResponse(null)).toEqual({ kind: "not_found" });
	});

	it("treats undefined as not_found", () => {
		expect(interpretResolveResponse(undefined)).toEqual({ kind: "not_found" });
	});

	it("treats non-object input as not_found", () => {
		expect(interpretResolveResponse("hello")).toEqual({ kind: "not_found" });
		expect(interpretResolveResponse(42)).toEqual({ kind: "not_found" });
		expect(interpretResolveResponse(true)).toEqual({ kind: "not_found" });
	});

	it("treats empty object as not_found", () => {
		expect(interpretResolveResponse({})).toEqual({ kind: "not_found" });
	});

	it("treats object with non-string target as not_found", () => {
		expect(interpretResolveResponse({ target: 123 })).toEqual({
			kind: "not_found",
		});
		expect(interpretResolveResponse({ target: null })).toEqual({
			kind: "not_found",
		});
	});

	it("treats expired: 'true' (string) as not_found (strict bool check)", () => {
		expect(interpretResolveResponse({ expired: "true" })).toEqual({
			kind: "not_found",
		});
	});
});

describe("validateCode", () => {
	it("accepts alphanumeric codes", () => {
		expect(validateCode("abc1")).toBe("abc1");
		expect(validateCode("ABC123xyz")).toBe("ABC123xyz");
		expect(validateCode("a")).toBe("a");
	});

	it("rejects empty string", () => {
		expect(validateCode("")).toBe(null);
	});

	it("rejects codes with special characters", () => {
		expect(validateCode("abc-1")).toBe(null);
		expect(validateCode("abc/1")).toBe(null);
		expect(validateCode("abc.1")).toBe(null);
		expect(validateCode("abc 1")).toBe(null);
		expect(validateCode("abc_1")).toBe(null);
	});

	it("rejects codes with path traversal attempts", () => {
		expect(validateCode("../etc/passwd")).toBe(null);
		expect(validateCode("..")).toBe(null);
	});

	it("rejects codes longer than 64 chars", () => {
		expect(validateCode("a".repeat(64))).toBe("a".repeat(64));
		expect(validateCode("a".repeat(65))).toBe(null);
	});

	it("rejects non-string input", () => {
		expect(validateCode(null)).toBe(null);
		expect(validateCode(undefined)).toBe(null);
		expect(validateCode(123)).toBe(null);
		expect(validateCode({})).toBe(null);
		expect(validateCode([])).toBe(null);
	});
});

describe("buildResolveUrl", () => {
	it("builds a URL with the code as a query param", () => {
		expect(buildResolveUrl("https://example.com", "abc1")).toBe(
			"https://example.com/_emdash/api/plugins/shortlink/resolve?code=abc1",
		);
	});

	it("URL-encodes the code", () => {
		// validateCode would reject these, but buildResolveUrl is a pure helper
		// and should not assume validation has happened.
		expect(buildResolveUrl("https://example.com", "a b")).toBe(
			"https://example.com/_emdash/api/plugins/shortlink/resolve?code=a%20b",
		);
		expect(buildResolveUrl("https://example.com", "a/b")).toBe(
			"https://example.com/_emdash/api/plugins/shortlink/resolve?code=a%2Fb",
		);
	});

	it("accepts origins with no trailing slash", () => {
		expect(buildResolveUrl("http://localhost:4321", "abc")).toBe(
			"http://localhost:4321/_emdash/api/plugins/shortlink/resolve?code=abc",
		);
	});
});
