import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeContext, makeContentItem } from "@plugdash/testing";
import { DEFAULT_ENRICHMENTS, type EnrichmentFlags } from "../src/enrich-logic.ts";

// Integration tests for the enrichkit plugin.
// The full lifecycle runs against a mocked EmDash context: KV is backed by a
// Map, and ctx.http.fetch is a mock. No request ever leaves the process.

describe("enrichkit integration", () => {
	let ctx: ReturnType<typeof makeContext>;
	let fetchMock: ReturnType<typeof vi.fn>;
	const kvStore: Map<string, unknown> = new Map();

	function jsonResponse(payload: unknown, status = 200): Response {
		return {
			status,
			json: () => Promise.resolve(payload),
		} as unknown as Response;
	}

	/** An Anthropic-shaped reply carrying `text` as the assistant message. */
	function anthropicReply(text: string, status = 200): Response {
		return jsonResponse(
			{
				content: [{ type: "text", text }],
				usage: { input_tokens: 500, output_tokens: 120 },
			},
			status,
		);
	}

	const GOOD_JSON = JSON.stringify({
		summary: "A short summary of the argument.",
		keyTopics: ["static sites", "content management"],
		autoTags: ["Static Sites", "cms"],
		tweetDraft: "Static sites grew up. Here is what changed.",
	});

	/** A Portable Text body comfortably over the 100-word floor. */
	function longBody(): Array<Record<string, unknown>> {
		return [
			{
				_type: "block",
				_key: "b1",
				style: "normal",
				children: [
					{
						_type: "span",
						_key: "s1",
						text: "word ".repeat(150).trim(),
					},
				],
			},
		];
	}

	function shortBody(): Array<Record<string, unknown>> {
		return [
			{
				_type: "block",
				_key: "b1",
				style: "normal",
				children: [{ _type: "span", _key: "s1", text: "Only a handful of words here." }],
			},
		];
	}

	function configure(enrichments: Partial<EnrichmentFlags> = {}): void {
		kvStore.set("enrichkit:config:provider", "anthropic");
		kvStore.set("enrichkit:config:apiKey", "sk-test-key-1234");
		kvStore.set("enrichkit:config:model", "");
		kvStore.set("enrichkit:config:enrichments", { ...DEFAULT_ENRICHMENTS, ...enrichments });
	}

	beforeEach(() => {
		kvStore.clear();
		globalThis.__plugdash_enrichkit_config__ = undefined;
		ctx = makeContext();

		ctx.kv.get = vi.fn().mockImplementation((key: string) => {
			return Promise.resolve(kvStore.get(key) ?? null);
		});
		ctx.kv.set = vi.fn().mockImplementation((key: string, value: unknown) => {
			kvStore.set(key, value);
			return Promise.resolve();
		});
		ctx.kv.delete = vi.fn().mockImplementation((key: string) => {
			kvStore.delete(key);
			return Promise.resolve();
		});
		ctx.kv.list = vi.fn().mockImplementation((prefix?: string) => {
			const entries: Array<{ key: string; value: unknown }> = [];
			for (const [key, value] of kvStore.entries()) {
				if (!prefix || key.startsWith(prefix)) entries.push({ key, value });
			}
			return Promise.resolve(entries);
		});

		fetchMock = vi.fn().mockResolvedValue(anthropicReply(GOOD_JSON));
		ctx.http = { fetch: fetchMock as unknown as typeof fetch };
	});

	async function runInstall() {
		const plugin = await import("../src/sandbox-entry.ts");
		const hook = plugin.default.hooks!["plugin:install"];
		await hook.handler({}, ctx);
	}

	async function runAfterSave(content: Record<string, unknown>, collection = "posts") {
		const plugin = await import("../src/sandbox-entry.ts");
		const hook = plugin.default.hooks!["content:afterSave"];
		await hook.handler({ content, collection }, ctx);
	}

	async function callAdmin(interaction?: Record<string, unknown>): Promise<unknown> {
		const plugin = await import("../src/sandbox-entry.ts");
		const route = plugin.default.routes!.admin;
		return route.handler({ input: interaction }, ctx);
	}

	function publishedPost(overrides: Record<string, unknown> = {}) {
		return makeContentItem({
			id: "post-1",
			status: "published",
			data: { title: "Static sites grew up", body: longBody(), metadata: {} },
			...overrides,
		});
	}

	/** The prompt text sent on the nth (0-based) fetch call. */
	function promptFromCall(index: number): string {
		const init = fetchMock.mock.calls[index]![1] as RequestInit;
		const body = JSON.parse(init.body as string) as {
			messages: Array<{ content: string }>;
		};
		return body.messages[0]!.content;
	}

	function updateArgs() {
		const update = ctx.content!.update as unknown as ReturnType<typeof vi.fn>;
		return update.mock.calls[0];
	}

	// ── Install ──

	describe("plugin:install", () => {
		it("seeds the default enrichment flags", async () => {
			await runInstall();
			expect(kvStore.get("enrichkit:config:enrichments")).toEqual(DEFAULT_ENRICHMENTS);
		});

		it("warns when no API key is configured", async () => {
			await runInstall();
			expect(ctx.log.warn).toHaveBeenCalled();
		});

		it("seeds from the build-time config when one is present", async () => {
			globalThis.__plugdash_enrichkit_config__ = {
				provider: "openai",
				apiKey: "sk-bootstrap",
				enrichments: { readingLevel: true },
			};
			await runInstall();
			expect(kvStore.get("enrichkit:config:provider")).toBe("openai");
			expect(kvStore.get("enrichkit:config:apiKey")).toBe("sk-bootstrap");
			expect(kvStore.get("enrichkit:config:enrichments")).toEqual({
				...DEFAULT_ENRICHMENTS,
				readingLevel: true,
			});
			expect(ctx.log.warn).not.toHaveBeenCalled();
		});
	});

	// ── Happy path ──

	describe("content:afterSave", () => {
		it("writes enrichkit metadata on publish", async () => {
			configure();
			await runAfterSave(publishedPost());

			expect(fetchMock).toHaveBeenCalledTimes(1);
			const [collection, id, patch] = updateArgs() as [
				string,
				string,
				{ metadata: Record<string, unknown> },
			];
			expect(collection).toBe("posts");
			expect(id).toBe("post-1");
			const enrichkit = patch.metadata.enrichkit as Record<string, unknown>;
			expect(enrichkit.summary).toBe("A short summary of the argument.");
			expect(enrichkit.keyTopics).toEqual(["static sites", "content management"]);
			expect(enrichkit.autoTags).toEqual(["static-sites", "cms"]);
			expect(enrichkit.model).toBe("claude-haiku-4-5");
			expect(typeof enrichkit.generatedAt).toBe("string");
		});

		it("calls the configured provider with the key in a header", async () => {
			configure();
			await runAfterSave(publishedPost());
			const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
			expect(url).toBe("https://api.anthropic.com/v1/messages");
			expect((init.headers as Record<string, string>)["x-api-key"]).toBe("sk-test-key-1234");
		});

		it("builds the prompt from only the enabled enrichments", async () => {
			configure({ tweetDraft: false, autoTags: false });
			await runAfterSave(publishedPost());
			const prompt = promptFromCall(0);
			expect(prompt).toContain('"summary"');
			expect(prompt).toContain('"keyTopics"');
			expect(prompt).not.toContain('"tweetDraft"');
			expect(prompt).not.toContain('"autoTags"');
			expect(prompt).toContain("Article title: Static sites grew up");
		});

		it("merges enrichkit into the existing metadata", async () => {
			configure();
			ctx.content!.get = vi.fn().mockResolvedValue({
				id: "post-1",
				data: { metadata: { readtime: { minutes: 4 }, enrichkit: { summary: "stale" } } },
			});
			await runAfterSave(publishedPost());
			const [, , patch] = updateArgs() as [string, string, { metadata: Record<string, unknown> }];
			expect(patch.metadata.readtime).toEqual({ minutes: 4 });
			expect((patch.metadata.enrichkit as Record<string, unknown>).summary).toBe(
				"A short summary of the argument.",
			);
		});

		it("skips non-published content", async () => {
			configure();
			await runAfterSave(publishedPost({ status: "draft" }));
			expect(fetchMock).not.toHaveBeenCalled();
			expect(ctx.content!.update).not.toHaveBeenCalled();
		});

		it("skips content under 100 words", async () => {
			configure();
			await runAfterSave(
				publishedPost({ data: { title: "Tiny", body: shortBody(), metadata: {} } }),
			);
			expect(fetchMock).not.toHaveBeenCalled();
			expect(ctx.log.info).toHaveBeenCalledWith(
				"enrichkit: content too short to enrich, skipping",
				expect.objectContaining({ wordCount: 6 }),
			);
		});

		it("skips and logs when the API key is not configured", async () => {
			kvStore.set("enrichkit:config:provider", "anthropic");
			await runAfterSave(publishedPost());
			expect(fetchMock).not.toHaveBeenCalled();
			expect(ctx.log.error).toHaveBeenCalledWith(
				"enrichkit: not configured, skipping",
				expect.objectContaining({ reason: expect.stringContaining("apiKey") }),
			);
		});

		it("skips when the network capability is unavailable", async () => {
			configure();
			ctx.http = undefined;
			await expect(runAfterSave(publishedPost())).resolves.toBeUndefined();
			expect(ctx.content!.update).not.toHaveBeenCalled();
		});
	});

	// ── Failure modes: none of these may fail the publish ──

	describe("failure handling", () => {
		it("does not fail the publish on an API error", async () => {
			configure();
			fetchMock.mockResolvedValue(jsonResponse({ error: "boom" }, 500));
			await expect(runAfterSave(publishedPost())).resolves.toBeUndefined();
			expect(ctx.content!.update).not.toHaveBeenCalled();
			expect(ctx.log.error).toHaveBeenCalled();
		});

		it("does not fail the publish on a timeout or network error", async () => {
			configure();
			fetchMock.mockRejectedValue(new DOMException("aborted", "AbortError"));
			await expect(runAfterSave(publishedPost())).resolves.toBeUndefined();
			expect(ctx.content!.update).not.toHaveBeenCalled();
			expect(ctx.log.error).toHaveBeenCalledWith(
				"enrichkit: provider request failed",
				expect.objectContaining({ err: expect.stringContaining("aborted") }),
			);
		});

		it("warns and does not retry on a rate limit", async () => {
			configure();
			fetchMock.mockResolvedValue(jsonResponse({ error: "slow down" }, 429));
			await runAfterSave(publishedPost());
			expect(fetchMock).toHaveBeenCalledTimes(1);
			expect(ctx.log.warn).toHaveBeenCalledWith(
				"enrichkit: rate limited, skipping enrichment",
				expect.objectContaining({ status: 429 }),
			);
			expect(ctx.content!.update).not.toHaveBeenCalled();
		});

		it("logs an actionable message on a quota error", async () => {
			configure();
			fetchMock.mockResolvedValue(jsonResponse({ error: "no credit" }, 402));
			await runAfterSave(publishedPost());
			expect(ctx.log.error).toHaveBeenCalledWith(
				expect.stringContaining("quota or billing"),
				expect.objectContaining({ status: 402 }),
			);
		});

		it("logs a key rejection on 401", async () => {
			configure();
			fetchMock.mockResolvedValue(jsonResponse({ error: "bad key" }, 401));
			await runAfterSave(publishedPost());
			expect(ctx.log.error).toHaveBeenCalledWith(
				"enrichkit: provider rejected the API key",
				expect.objectContaining({ status: 401 }),
			);
		});

		it("retries once when the model returns invalid JSON, then succeeds", async () => {
			configure();
			fetchMock
				.mockResolvedValueOnce(anthropicReply("Sure! Here is the JSON:"))
				.mockResolvedValueOnce(anthropicReply(GOOD_JSON));
			await runAfterSave(publishedPost());
			expect(fetchMock).toHaveBeenCalledTimes(2);
			expect(ctx.content!.update).toHaveBeenCalledTimes(1);
			expect(ctx.log.warn).toHaveBeenCalledWith(
				"enrichkit: model returned unusable JSON, retrying once",
				expect.objectContaining({ reason: expect.any(String) }),
			);
		});

		it("gives up after the retry also returns invalid JSON", async () => {
			configure();
			fetchMock.mockResolvedValue(anthropicReply("still not JSON"));
			await expect(runAfterSave(publishedPost())).resolves.toBeUndefined();
			expect(fetchMock).toHaveBeenCalledTimes(2);
			expect(ctx.content!.update).not.toHaveBeenCalled();
			expect(ctx.log.error).toHaveBeenCalledWith(
				"enrichkit: model returned unusable JSON twice, skipping",
				expect.objectContaining({ reason: expect.any(String) }),
			);
		});

		it("does not write metadata when no field survives validation", async () => {
			configure();
			fetchMock.mockResolvedValue(anthropicReply(JSON.stringify({ unrelated: "field" })));
			await runAfterSave(publishedPost());
			expect(ctx.content!.update).not.toHaveBeenCalled();
			expect(ctx.log.warn).toHaveBeenCalledWith(
				"enrichkit: model returned no usable fields, skipping",
			);
		});

		it("does not fail the publish when the content update throws", async () => {
			configure();
			ctx.content!.update = vi.fn().mockRejectedValue(new Error("write failed"));
			await expect(runAfterSave(publishedPost())).resolves.toBeUndefined();
			expect(ctx.log.error).toHaveBeenCalledWith(
				"enrichkit: afterSave failed",
				expect.objectContaining({ err: expect.stringContaining("write failed") }),
			);
		});

		it("does not fail the publish on a malformed provider payload", async () => {
			configure();
			fetchMock.mockResolvedValue(jsonResponse({ nothing: "useful" }));
			await expect(runAfterSave(publishedPost())).resolves.toBeUndefined();
			expect(ctx.content!.update).not.toHaveBeenCalled();
		});
	});

	// ── Admin page ──

	describe("admin settings page", () => {
		it("renders the settings form on page load", async () => {
			configure();
			const page = (await callAdmin()) as { blocks: Array<Record<string, unknown>> };
			const form = page.blocks.find((b) => b.type === "form") as {
				fields: Array<{ action_id: string; initial_value?: unknown }>;
			};
			expect(form.fields.map((f) => f.action_id)).toEqual([
				"provider",
				"apiKey",
				"model",
				"enrichments",
			]);
		});

		it("never renders the stored API key back into the form", async () => {
			configure();
			const page = (await callAdmin()) as { blocks: Array<Record<string, unknown>> };
			expect(JSON.stringify(page)).not.toContain("sk-test-key-1234");
			expect(JSON.stringify(page)).toContain("sk-t...1234");
		});

		it("saves submitted settings", async () => {
			configure();
			const page = (await callAdmin({
				type: "form_submit",
				action_id: "save_settings",
				values: {
					provider: "openai",
					apiKey: "sk-new-key-5678",
					model: "gpt-4o",
					enrichments: ["summary", "readingLevel"],
				},
			})) as { toast: { message: string; type: string } };
			expect(page.toast.type).toBe("success");
			expect(kvStore.get("enrichkit:config:provider")).toBe("openai");
			expect(kvStore.get("enrichkit:config:apiKey")).toBe("sk-new-key-5678");
			expect(kvStore.get("enrichkit:config:model")).toBe("gpt-4o");
			expect(kvStore.get("enrichkit:config:enrichments")).toEqual({
				summary: true,
				keyTopics: false,
				readingLevel: true,
				autoTags: false,
				tweetDraft: false,
			});
		});

		it("keeps the stored API key when the field is submitted blank", async () => {
			configure();
			await callAdmin({
				type: "form_submit",
				action_id: "save_settings",
				values: {
					provider: "anthropic",
					apiKey: "",
					model: "",
					enrichments: ["summary"],
				},
			});
			expect(kvStore.get("enrichkit:config:apiKey")).toBe("sk-test-key-1234");
		});

		it("rejects an unknown provider", async () => {
			configure();
			const page = (await callAdmin({
				type: "form_submit",
				action_id: "save_settings",
				values: { provider: "gemini", apiKey: "", enrichments: ["summary"] },
			})) as { toast: { message: string; type: string } };
			expect(page.toast.type).toBe("error");
			expect(kvStore.get("enrichkit:config:provider")).toBe("anthropic");
		});

		it("rejects a submission with no enrichments selected", async () => {
			configure();
			const page = (await callAdmin({
				type: "form_submit",
				action_id: "save_settings",
				values: { provider: "anthropic", apiKey: "", enrichments: [] },
			})) as { toast: { message: string; type: string } };
			expect(page.toast.type).toBe("error");
			expect(page.toast.message).toContain("at least one");
		});

		it("rejects a submission with no key stored and none supplied", async () => {
			const page = (await callAdmin({
				type: "form_submit",
				action_id: "save_settings",
				values: { provider: "anthropic", apiKey: "", enrichments: ["summary"] },
			})) as { toast: { message: string; type: string } };
			expect(page.toast.type).toBe("error");
			expect(page.toast.message).toContain("API key");
		});

		it("falls back to the page for an unrecognised interaction", async () => {
			configure();
			const page = (await callAdmin({ type: "block_action", action_id: "whatever" })) as {
				blocks: unknown[];
			};
			expect(Array.isArray(page.blocks)).toBe(true);
		});
	});

	// ── Build-time config drift ──

	describe("bootstrap reseeding", () => {
		it("reseeds KV when the build-time config changes", async () => {
			configure();
			globalThis.__plugdash_enrichkit_config__ = {
				provider: "openai",
				apiKey: "sk-from-astro-config",
			};
			await runAfterSave(publishedPost());
			expect(kvStore.get("enrichkit:config:provider")).toBe("openai");
			const [url] = fetchMock.mock.calls[0] as [string];
			expect(url).toBe("https://api.openai.com/v1/chat/completions");
		});
	});
});
