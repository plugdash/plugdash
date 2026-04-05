import { describe, it, expect, vi, beforeEach } from "vitest";
import { generateCode } from "../src/sandbox-entry.ts";
import { makeContext, makeContentItem } from "@plugdash/testing";

// ── generateCode ──

describe("generateCode", () => {
	it("generates code of configured length", () => {
		const code = generateCode(4);
		expect(code).toHaveLength(4);
	});

	it("generates code of different lengths", () => {
		expect(generateCode(6)).toHaveLength(6);
		expect(generateCode(8)).toHaveLength(8);
	});

	it("generates alphanumeric codes only", () => {
		for (let i = 0; i < 100; i++) {
			const code = generateCode(4);
			expect(code).toMatch(/^[a-zA-Z0-9]+$/);
		}
	});

	it("generates different codes on successive calls", () => {
		const codes = new Set<string>();
		for (let i = 0; i < 50; i++) {
			codes.add(generateCode(6));
		}
		// With 62^6 possibilities, 50 codes should all be unique
		expect(codes.size).toBe(50);
	});
});

// ── shortlink hook: content:afterSave ──

describe("shortlink hook: content:afterSave", () => {
	let ctx: ReturnType<typeof makeContext>;

	beforeEach(() => {
		ctx = makeContext();
	});

	async function runHook(
		content: Record<string, unknown>,
		collection = "posts",
	) {
		const plugin = await import("../src/sandbox-entry.ts");
		const hook = plugin.default.hooks!["content:afterSave"];
		const event = { content, collection, isNew: false };
		await hook.handler(event, ctx);
	}

	it("creates shortlink on publish", async () => {
		const content = makeContentItem({
			status: "published",
			slug: "my-post",
			data: { body: [], metadata: {} },
		});

		// No existing shortlink for this content
		ctx.kv.get = vi.fn().mockImplementation((key: string) => {
			if (key.startsWith("shortlink:by-content:")) return Promise.resolve(null);
			if (key.startsWith("shortlink:")) return Promise.resolve(null);
			if (key === "config:autoCreate") return Promise.resolve(true);
			if (key === "config:codeLength") return Promise.resolve(4);
			if (key === "config:prefix") return Promise.resolve("/s/");
			if (key === "config:domain") return Promise.resolve(null);
			return Promise.resolve(null);
		});

		ctx.content!.get = vi.fn().mockResolvedValue({
			id: content.id,
			type: "posts",
			slug: "my-post",
			status: "published",
			data: { body: [], metadata: {} },
			createdAt: content.createdAt,
			updatedAt: content.updatedAt,
		});

		await runHook(content, "posts");

		// Should have stored shortlink data in KV
		expect(ctx.kv.set).toHaveBeenCalled();
		// Should have written metadata
		expect(ctx.content!.update).toHaveBeenCalledWith(
			"posts",
			content.id,
			expect.objectContaining({
				metadata: expect.objectContaining({
					shortlink: expect.objectContaining({
						code: expect.any(String),
						url: expect.stringMatching(/^\/s\//),
					}),
				}),
			}),
		);
	});

	it("skips non-published content", async () => {
		const content = makeContentItem({ status: "draft" });
		await runHook(content);
		expect(ctx.kv.set).not.toHaveBeenCalled();
		expect(ctx.content!.update).not.toHaveBeenCalled();
	});

	it("skips if shortlink already exists for contentId", async () => {
		const content = makeContentItem({
			status: "published",
			data: { body: [], metadata: {} },
		});

		ctx.kv.get = vi.fn().mockImplementation((key: string) => {
			if (key === `shortlink:by-content:${content.id}`) {
				return Promise.resolve("existingcode");
			}
			if (key === "config:autoCreate") return Promise.resolve(true);
			if (key === "config:codeLength") return Promise.resolve(4);
			if (key === "config:prefix") return Promise.resolve("/s/");
			if (key === "config:domain") return Promise.resolve(null);
			return Promise.resolve(null);
		});

		await runHook(content, "posts");

		// Should not create a new shortlink
		expect(ctx.kv.set).not.toHaveBeenCalled();
		expect(ctx.content!.update).not.toHaveBeenCalled();
	});

	it("skips when autoCreate is false", async () => {
		const content = makeContentItem({
			status: "published",
			data: { body: [], metadata: {} },
		});

		ctx.kv.get = vi.fn().mockImplementation((key: string) => {
			if (key === "config:autoCreate") return Promise.resolve(false);
			return Promise.resolve(null);
		});

		await runHook(content, "posts");
		expect(ctx.kv.set).not.toHaveBeenCalled();
		expect(ctx.content!.update).not.toHaveBeenCalled();
	});

	it("writes metadata.shortlink to content", async () => {
		const content = makeContentItem({
			status: "published",
			slug: "test-post",
			data: { body: [], metadata: {} },
		});

		ctx.kv.get = vi.fn().mockImplementation((key: string) => {
			if (key.startsWith("shortlink:by-content:")) return Promise.resolve(null);
			if (key.startsWith("shortlink:")) return Promise.resolve(null);
			if (key === "config:autoCreate") return Promise.resolve(true);
			if (key === "config:codeLength") return Promise.resolve(4);
			if (key === "config:prefix") return Promise.resolve("/s/");
			if (key === "config:domain") return Promise.resolve(null);
			return Promise.resolve(null);
		});

		ctx.content!.get = vi.fn().mockResolvedValue({
			id: content.id,
			type: "posts",
			slug: "test-post",
			status: "published",
			data: { body: [], metadata: {} },
			createdAt: content.createdAt,
			updatedAt: content.updatedAt,
		});

		await runHook(content, "posts");

		const updateCall = (ctx.content!.update as ReturnType<typeof vi.fn>).mock.calls[0]!;
		const updatedData = updateCall[2];
		expect(updatedData.metadata.shortlink).toBeDefined();
		expect(updatedData.metadata.shortlink.code).toMatch(/^[a-zA-Z0-9]{4}$/);
		expect(updatedData.metadata.shortlink.url).toMatch(/^\/s\/[a-zA-Z0-9]{4}$/);
		expect(updatedData.metadata.shortlink.fullUrl).toMatch(
			/^https:\/\/example\.com\/s\/[a-zA-Z0-9]{4}$/,
		);
	});

	it("merges with existing metadata, does not overwrite other fields", async () => {
		const content = makeContentItem({
			status: "published",
			slug: "test-post",
			data: {
				body: [],
				metadata: { author: "someone", readingTimeMinutes: 3 },
			},
		});

		ctx.kv.get = vi.fn().mockImplementation((key: string) => {
			if (key.startsWith("shortlink:by-content:")) return Promise.resolve(null);
			if (key.startsWith("shortlink:")) return Promise.resolve(null);
			if (key === "config:autoCreate") return Promise.resolve(true);
			if (key === "config:codeLength") return Promise.resolve(4);
			if (key === "config:prefix") return Promise.resolve("/s/");
			if (key === "config:domain") return Promise.resolve(null);
			return Promise.resolve(null);
		});

		ctx.content!.get = vi.fn().mockResolvedValue({
			id: content.id,
			type: "posts",
			slug: "test-post",
			status: "published",
			data: { body: [], metadata: { author: "someone", readingTimeMinutes: 3 } },
			createdAt: content.createdAt,
			updatedAt: content.updatedAt,
		});

		await runHook(content, "posts");

		const updateCall = (ctx.content!.update as ReturnType<typeof vi.fn>).mock.calls[0]!;
		const updatedData = updateCall[2];
		expect(updatedData.metadata.author).toBe("someone");
		expect(updatedData.metadata.readingTimeMinutes).toBe(3);
		expect(updatedData.metadata.shortlink).toBeDefined();
	});

	it("handles undefined ctx.content gracefully", async () => {
		const noContentCtx = makeContext({ content: undefined });
		const content = makeContentItem({ status: "published" });

		const plugin = await import("../src/sandbox-entry.ts");
		const hook = plugin.default.hooks!["content:afterSave"];
		const event = { content, collection: "posts", isNew: false };

		await expect(hook.handler(event, noContentCtx)).resolves.toBeUndefined();
		expect(noContentCtx.log.error).toHaveBeenCalled();
	});

	it("uses custom domain for fullUrl when configured", async () => {
		const content = makeContentItem({
			status: "published",
			slug: "test-post",
			data: { body: [], metadata: {} },
		});

		ctx.kv.get = vi.fn().mockImplementation((key: string) => {
			if (key.startsWith("shortlink:by-content:")) return Promise.resolve(null);
			if (key.startsWith("shortlink:")) return Promise.resolve(null);
			if (key === "config:autoCreate") return Promise.resolve(true);
			if (key === "config:codeLength") return Promise.resolve(4);
			if (key === "config:prefix") return Promise.resolve("/s/");
			if (key === "config:domain") return Promise.resolve("https://short.me");
			return Promise.resolve(null);
		});

		ctx.content!.get = vi.fn().mockResolvedValue({
			id: content.id,
			type: "posts",
			slug: "test-post",
			status: "published",
			data: { body: [], metadata: {} },
			createdAt: content.createdAt,
			updatedAt: content.updatedAt,
		});

		await runHook(content, "posts");

		const updateCall = (ctx.content!.update as ReturnType<typeof vi.fn>).mock.calls[0]!;
		const updatedData = updateCall[2];
		expect(updatedData.metadata.shortlink.fullUrl).toMatch(
			/^https:\/\/short\.me\/s\/[a-zA-Z0-9]{4}$/,
		);
	});
});

// ── resolve route handler ──

describe("resolve route handler", () => {
	let ctx: ReturnType<typeof makeContext>;

	beforeEach(() => {
		ctx = makeContext();
	});

	async function callResolve(code: string) {
		const plugin = await import("../src/sandbox-entry.ts");
		const route = plugin.default.routes!.resolve;
		const routeCtx = {
			input: undefined,
			request: new Request(`https://example.com/_emdash/api/plugins/shortlink/resolve?code=${code}`),
		};
		return route.handler(routeCtx, ctx);
	}

	it("redirects to target URL with 301", async () => {
		ctx.kv.get = vi.fn().mockImplementation((key: string) => {
			if (key === "shortlink:testcode") {
				return Promise.resolve({
					code: "testcode",
					target: "/posts/my-post",
					contentId: "content-001",
					collection: "posts",
					createdAt: "2026-01-01T00:00:00Z",
					custom: false,
				});
			}
			return Promise.resolve(null);
		});

		const result = await callResolve("testcode");
		expect(result).toEqual(
			expect.objectContaining({
				target: "/posts/my-post",
				code: "testcode",
			}),
		);
	});

	it("returns error for unknown code", async () => {
		ctx.kv.get = vi.fn().mockResolvedValue(null);

		const result = await callResolve("nope");
		expect(result).toEqual(
			expect.objectContaining({ error: "not_found" }),
		);
	});

	it("returns expired for expired link", async () => {
		ctx.kv.get = vi.fn().mockImplementation((key: string) => {
			if (key === "shortlink:oldcode") {
				return Promise.resolve({
					code: "oldcode",
					target: "/posts/old-post",
					contentId: "content-001",
					collection: "posts",
					createdAt: "2025-01-01T00:00:00Z",
					expiresAt: "2025-06-01T00:00:00Z",
					custom: false,
				});
			}
			return Promise.resolve(null);
		});

		const result = await callResolve("oldcode");
		expect(result).toEqual(
			expect.objectContaining({ expired: true }),
		);
	});

	it("handles /s/ prefix correctly - extracts code from query param", async () => {
		ctx.kv.get = vi.fn().mockImplementation((key: string) => {
			if (key === "shortlink:ab3k") {
				return Promise.resolve({
					code: "ab3k",
					target: "/posts/hello",
					contentId: "content-001",
					collection: "posts",
					createdAt: "2026-01-01T00:00:00Z",
					custom: false,
				});
			}
			return Promise.resolve(null);
		});

		const result = await callResolve("ab3k");
		expect(result).toEqual(
			expect.objectContaining({ target: "/posts/hello" }),
		);
	});

	it("returns error when code query param is missing", async () => {
		const plugin = await import("../src/sandbox-entry.ts");
		const route = plugin.default.routes!.resolve;
		const routeCtx = {
			input: undefined,
			request: new Request("https://example.com/_emdash/api/plugins/shortlink/resolve"),
		};

		const result = await route.handler(routeCtx, ctx);
		expect(result).toEqual(
			expect.objectContaining({ error: "missing_code" }),
		);
	});
});

// ── custom shortlink creation (admin route) ──

describe("custom shortlink creation", () => {
	let ctx: ReturnType<typeof makeContext>;

	beforeEach(() => {
		ctx = makeContext();
	});

	async function callAdmin(interaction: Record<string, unknown>) {
		const plugin = await import("../src/sandbox-entry.ts");
		const route = plugin.default.routes!.admin;
		const routeCtx = {
			input: interaction,
			request: new Request("https://example.com/_emdash/api/plugins/shortlink/admin"),
		};
		return route.handler(routeCtx, ctx);
	}

	it("accepts user-defined code", async () => {
		ctx.kv.get = vi.fn().mockResolvedValue(null);

		const result = await callAdmin({
			type: "form_submit",
			action_id: "create_shortlink",
			values: { code: "myslug", target: "/posts/my-post" },
		});

		expect(ctx.kv.set).toHaveBeenCalledWith(
			"shortlink:myslug",
			expect.objectContaining({
				code: "myslug",
				target: "/posts/my-post",
				custom: true,
			}),
		);
		expect(result).toEqual(
			expect.objectContaining({
				toast: expect.objectContaining({ type: "success" }),
			}),
		);
	});

	it("rejects duplicate custom codes", async () => {
		ctx.kv.get = vi.fn().mockImplementation((key: string) => {
			if (key === "shortlink:taken") {
				return Promise.resolve({
					code: "taken",
					target: "/posts/other",
					custom: true,
				});
			}
			return Promise.resolve(null);
		});

		const result = await callAdmin({
			type: "form_submit",
			action_id: "create_shortlink",
			values: { code: "taken", target: "/posts/my-post" },
		});

		expect(result).toEqual(
			expect.objectContaining({
				toast: expect.objectContaining({ type: "error" }),
			}),
		);
		// Should not overwrite
		expect(ctx.kv.set).not.toHaveBeenCalled();
	});

	it("rejects codes with invalid characters", async () => {
		ctx.kv.get = vi.fn().mockResolvedValue(null);

		const result = await callAdmin({
			type: "form_submit",
			action_id: "create_shortlink",
			values: { code: "my slug!", target: "/posts/my-post" },
		});

		expect(result).toEqual(
			expect.objectContaining({
				toast: expect.objectContaining({ type: "error" }),
			}),
		);
		expect(ctx.kv.set).not.toHaveBeenCalled();
	});

	it("rejects missing target URL", async () => {
		ctx.kv.get = vi.fn().mockResolvedValue(null);

		const result = await callAdmin({
			type: "form_submit",
			action_id: "create_shortlink",
			values: { code: "myslug", target: "" },
		});

		expect(result).toEqual(
			expect.objectContaining({
				toast: expect.objectContaining({ type: "error" }),
			}),
		);
		expect(ctx.kv.set).not.toHaveBeenCalled();
	});
});

// ── admin: save_settings ──

describe("admin save_settings", () => {
	let ctx: ReturnType<typeof makeContext>;

	beforeEach(() => {
		ctx = makeContext();
	});

	async function callAdmin(interaction: Record<string, unknown>) {
		const plugin = await import("../src/sandbox-entry.ts");
		const route = plugin.default.routes!.admin;
		return route.handler(
			{
				input: interaction,
				request: new Request(
					"https://example.com/_emdash/api/plugins/shortlink/admin",
				),
			},
			ctx,
		);
	}

	it("writes settings to KV on submit", async () => {
		ctx.kv.list = vi.fn().mockResolvedValue([]);
		const res = await callAdmin({
			type: "form_submit",
			action_id: "save_settings",
			values: {
				prefix: "/go/",
				codeLength: 5,
				autoCreate: false,
				domain: "https://short.example.com",
			},
		});
		expect(ctx.kv.set).toHaveBeenCalledWith("config:prefix", "/go/");
		expect(ctx.kv.set).toHaveBeenCalledWith("config:codeLength", 5);
		expect(ctx.kv.set).toHaveBeenCalledWith("config:autoCreate", false);
		expect(ctx.kv.set).toHaveBeenCalledWith(
			"config:domain",
			"https://short.example.com",
		);
		expect(res).toEqual(
			expect.objectContaining({
				toast: expect.objectContaining({ type: "success" }),
			}),
		);
	});

	it("stores null when domain is blank", async () => {
		ctx.kv.list = vi.fn().mockResolvedValue([]);
		await callAdmin({
			type: "form_submit",
			action_id: "save_settings",
			values: { prefix: "/s/", codeLength: 4, autoCreate: true, domain: "" },
		});
		expect(ctx.kv.set).toHaveBeenCalledWith("config:domain", null);
	});
});

// ── admin: delete_shortlink ──

describe("admin delete_shortlink", () => {
	let ctx: ReturnType<typeof makeContext>;

	beforeEach(() => {
		ctx = makeContext();
	});

	async function callAdmin(interaction: Record<string, unknown>) {
		const plugin = await import("../src/sandbox-entry.ts");
		const route = plugin.default.routes!.admin;
		return route.handler(
			{
				input: interaction,
				request: new Request(
					"https://example.com/_emdash/api/plugins/shortlink/admin",
				),
			},
			ctx,
		);
	}

	it("removes shortlink and reverse index when present", async () => {
		ctx.kv.get = vi.fn().mockImplementation((key: string) => {
			if (key === "shortlink:abc") {
				return Promise.resolve({
					code: "abc",
					target: "/posts/my",
					contentId: "post-123",
					custom: false,
					createdAt: "2026-04-06",
				});
			}
			return Promise.resolve(null);
		});
		ctx.kv.list = vi.fn().mockResolvedValue([]);

		await callAdmin({
			type: "block_action",
			action_id: "delete_shortlink:abc",
		});

		expect(ctx.kv.delete).toHaveBeenCalledWith("shortlink:abc");
		expect(ctx.kv.delete).toHaveBeenCalledWith("shortlink:by-content:post-123");
	});

	it("only deletes shortlink entry when no contentId", async () => {
		ctx.kv.get = vi.fn().mockImplementation((key: string) => {
			if (key === "shortlink:custom-code") {
				return Promise.resolve({
					code: "custom-code",
					target: "/external",
					custom: true,
					createdAt: "2026-04-06",
				});
			}
			return Promise.resolve(null);
		});
		ctx.kv.list = vi.fn().mockResolvedValue([]);

		await callAdmin({
			type: "block_action",
			action_id: "delete_shortlink:custom-code",
		});

		expect(ctx.kv.delete).toHaveBeenCalledWith("shortlink:custom-code");
		// reverse index delete should not be called
		const deleteCalls = (ctx.kv.delete as ReturnType<typeof vi.fn>).mock.calls;
		const reverseIndexCalls = deleteCalls.filter((c) =>
			String(c[0]).startsWith("shortlink:by-content:"),
		);
		expect(reverseIndexCalls).toHaveLength(0);
	});
});
