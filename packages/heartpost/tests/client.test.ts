import { describe, expect, it } from "vitest";
import { parseHeartResponse, unwrap } from "../src/client";

describe("parseHeartResponse", () => {
	it("reads the EmDash wrapped shape", () => {
		expect(parseHeartResponse({ success: true, data: { count: 3, hearted: true } })).toEqual({
			count: 3,
			hearted: true,
		});
	});
	it("reads the bare shape", () => {
		expect(parseHeartResponse({ count: 2, hearted: false })).toEqual({ count: 2, hearted: false });
	});
	it("returns null on success:false so the UI is untouched", () => {
		expect(parseHeartResponse({ success: false, error: { message: "x" } })).toBeNull();
	});
	it("returns null for junk and omits missing fields", () => {
		expect(parseHeartResponse(null)).toBeNull();
		expect(parseHeartResponse("x")).toBeNull();
		expect(parseHeartResponse({ success: true, data: {} })).toEqual({});
		expect(unwrap({ success: true, data: null })).toBeNull();
	});
});
