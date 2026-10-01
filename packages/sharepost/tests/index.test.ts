import { describe, it, expect } from "vitest";
import { generateShareUrl, generateAllShareUrls, resolveShareUrl } from "../src/utils.ts";
import { sharepostPlugin, createPlugin } from "../src/index.ts";

// ── generateShareUrl ──

describe("generateShareUrl", () => {
	const baseArgs = {
		title: "My Great Post",
		url: "https://example.com/posts/my-great-post",
	};

	it("generates correct Twitter URL with title and url", () => {
		const result = generateShareUrl("twitter", baseArgs);
		expect(result).toContain("https://twitter.com/intent/tweet?");
		// URLSearchParams encodes spaces as + (valid per application/x-www-form-urlencoded)
		expect(result).toContain("text=My+Great+Post");
		expect(result).toContain("url=https%3A%2F%2Fexample.com%2Fposts%2Fmy-great-post");
	});

	it("includes via when configured", () => {
		const result = generateShareUrl("twitter", { ...baseArgs, via: "abhinavs" });
		expect(result).toContain("via=abhinavs");
	});

	it("includes hashtags when configured", () => {
		const result = generateShareUrl("twitter", {
			...baseArgs,
			hashtags: ["emdash", "cms"],
		});
		expect(result).toContain("hashtags=emdash%2Ccms");
	});

	it("generates correct LinkedIn URL", () => {
		const result = generateShareUrl("linkedin", baseArgs);
		expect(result).toBe(
			"https://www.linkedin.com/sharing/share-offsite/?url=https%3A%2F%2Fexample.com%2Fposts%2Fmy-great-post",
		);
	});

	it("generates correct WhatsApp URL", () => {
		const result = generateShareUrl("whatsapp", baseArgs);
		expect(result).toBe(
			"https://api.whatsapp.com/send?text=My%20Great%20Post%20https%3A%2F%2Fexample.com%2Fposts%2Fmy-great-post",
		);
	});

	it("generates correct Bluesky URL", () => {
		const result = generateShareUrl("bluesky", baseArgs);
		expect(result).toBe(
			"https://bsky.app/intent/compose?text=My%20Great%20Post%20https%3A%2F%2Fexample.com%2Fposts%2Fmy-great-post",
		);
	});

	it("generates correct email URL", () => {
		const result = generateShareUrl("email", baseArgs);
		expect(result).toBe(
			"mailto:?subject=My%20Great%20Post&body=My%20Great%20Post%0A%0Ahttps%3A%2F%2Fexample.com%2Fposts%2Fmy-great-post",
		);
	});

	it("URL-encodes special characters in title", () => {
		const result = generateShareUrl("twitter", {
			...baseArgs,
			title: 'Hello & Goodbye: A "Post"',
		});
		// URLSearchParams encodes spaces as +
		expect(result).toContain("text=Hello+%26+Goodbye%3A+A+%22Post%22");
	});

	it("truncates title to 200 chars for Twitter only", () => {
		const longTitle = "A".repeat(250);
		const twitterResult = generateShareUrl("twitter", { ...baseArgs, title: longTitle });

		// Twitter should have truncated title (200 chars + "...")
		const truncated = "A".repeat(200) + "...";
		expect(twitterResult).toContain(`text=${encodeURIComponent(truncated)}`);

		// WhatsApp includes full title - no truncation
		const whatsappResult = generateShareUrl("whatsapp", { ...baseArgs, title: longTitle });
		expect(whatsappResult).toContain(`text=${encodeURIComponent(longTitle)}`);
	});
});

// ── generateAllShareUrls ──

describe("generateAllShareUrls", () => {
	it("generates URLs for all default platforms", () => {
		const result = generateAllShareUrls({
			title: "Test",
			url: "https://example.com/test",
			platforms: ["twitter", "linkedin", "whatsapp", "bluesky", "email"],
		});
		expect(Object.keys(result)).toEqual(["twitter", "linkedin", "whatsapp", "bluesky", "email"]);
	});

	it("only includes configured platforms", () => {
		const result = generateAllShareUrls({
			title: "Test",
			url: "https://example.com/test",
			platforms: ["twitter", "bluesky"],
		});
		expect(Object.keys(result)).toEqual(["twitter", "bluesky"]);
		expect(result.linkedin).toBeUndefined();
	});

	it("passes via and hashtags to Twitter URL", () => {
		const result = generateAllShareUrls({
			title: "Test",
			url: "https://example.com/test",
			platforms: ["twitter"],
			via: "abhinavs",
			hashtags: ["emdash"],
		});
		expect(result.twitter).toContain("via=abhinavs");
		expect(result.twitter).toContain("hashtags=emdash");
	});
});

describe("resolveShareUrl", () => {
	it("is absolute without Astro.site, using the request origin", () => {
		expect(resolveShareUrl(undefined, "/posts/a", undefined, "http://127.0.0.1:4321")).toBe(
			"http://127.0.0.1:4321/posts/a",
		);
	});

	it("uses Astro.site when set", () => {
		expect(
			resolveShareUrl(undefined, "/posts/a", new URL("https://example.com"), "http://internal:4321"),
		).toBe("https://example.com/posts/a");
	});

	it("prefers an explicit url", () => {
		expect(resolveShareUrl("https://x.dev/p", "/posts/a", undefined, "http://h")).toBe("https://x.dev/p");
	});
});

describe("via and hashtags", () => {
	const args = { title: "T", url: "https://e.com/p", via: "abhinavs", hashtags: ["emdash"] };

	it("appear only on the Twitter/X link", () => {
		const all = generateAllShareUrls({
			...args,
			platforms: ["twitter", "linkedin", "whatsapp", "bluesky", "email"],
		});
		expect(all.twitter).toContain("via=abhinavs");
		expect(all.twitter).toContain("hashtags=emdash");
		for (const p of ["linkedin", "whatsapp", "bluesky", "email"]) {
			expect(all[p]).not.toContain("abhinavs");
			expect(all[p]).not.toContain("hashtags");
		}
	});

	it("all five links carry the absolute post URL", () => {
		const all = generateAllShareUrls({
			...args,
			platforms: ["twitter", "linkedin", "whatsapp", "bluesky", "email"],
		});
		for (const href of Object.values(all)) {
			expect(decodeURIComponent(href.replace(/\+/g, " "))).toContain("https://e.com/p");
		}
	});
});

describe("no-op native descriptor", () => {
	it("is native with no capabilities and ignores config", () => {
		const d = sharepostPlugin({ via: "abhinavs" });
		expect(d).toMatchObject({ id: "sharepost", format: "native", entrypoint: "@plugdash/sharepost" });
		expect(d.capabilities).toEqual([]);
	});

	it("createPlugin returns a resolved plugin with id, version and empty hooks", () => {
		const p = createPlugin();
		expect(p.id).toBe("sharepost");
		expect(p.version).toBeTruthy();
		expect(p.hooks).toEqual({});
	});
});
