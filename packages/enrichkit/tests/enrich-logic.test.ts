import { describe, it, expect } from "vitest";
import {
	buildPrompt,
	buildRequest,
	classifyStatus,
	countWords,
	enabledFields,
	extractCompletion,
	extractText,
	parseEnrichmentResponse,
	parseEnrichmentSelection,
	resolveEnrichments,
	validateConfig,
	DEFAULT_ENRICHMENTS,
	DEFAULT_MODEL,
	MAX_BODY_CHARS,
	MAX_TWEET_LENGTH,
	type EnrichmentFlags,
} from "../src/enrich-logic.ts";
import { enrichkitPlugin, providerHosts } from "../src/index.ts";

const ALL_ON: EnrichmentFlags = {
	summary: true,
	keyTopics: true,
	readingLevel: true,
	autoTags: true,
	tweetDraft: true,
};

function block(text: string, type = "block"): Record<string, unknown> {
	return {
		_type: type,
		_key: `k-${text.slice(0, 6)}`,
		style: "normal",
		children: [{ _type: "span", _key: "s1", text }],
	};
}

// ── Body text extraction ──

describe("extractText", () => {
	it("joins the text of span children across blocks", () => {
		const body = [block("First para."), block("Second para.")];
		expect(extractText(body)).toBe("First para.\n\nSecond para.");
	});

	it("concatenates multiple spans within one block", () => {
		const body = [
			{
				_type: "block",
				_key: "b1",
				children: [
					{ _type: "span", _key: "s1", text: "Hello " },
					{ _type: "span", _key: "s2", text: "world" },
				],
			},
		];
		expect(extractText(body)).toBe("Hello world");
	});

	it("skips non-prose blocks like images and code", () => {
		const body = [
			block("Kept."),
			{ _type: "image", _key: "i1", asset: { _ref: "x" } },
			{ _type: "code", _key: "c1", code: "const x = 1;" },
		];
		expect(extractText(body)).toBe("Kept.");
	});

	it("ignores non-span children", () => {
		const body = [
			{
				_type: "block",
				_key: "b1",
				children: [
					{ _type: "span", _key: "s1", text: "visible" },
					{ _type: "footnote", _key: "f1", text: "hidden" },
				],
			},
		];
		expect(extractText(body)).toBe("visible");
	});

	it("returns an empty string for a missing or non-array body", () => {
		expect(extractText(undefined)).toBe("");
		expect(extractText("not an array")).toBe("");
		expect(extractText([])).toBe("");
	});
});

describe("countWords", () => {
	it("counts whitespace-separated words", () => {
		expect(countWords("one two three")).toBe(3);
	});

	it("collapses runs of whitespace", () => {
		expect(countWords("one   two\n\nthree\t four")).toBe(4);
	});

	it("returns zero for empty or whitespace-only input", () => {
		expect(countWords("")).toBe(0);
		expect(countWords("   \n  ")).toBe(0);
	});
});

// ── Prompt construction ──

describe("prompt construction", () => {
	it("includes only enabled enrichment fields", () => {
		const prompt = buildPrompt("Title", "Body", {
			summary: true,
			keyTopics: true,
			readingLevel: false,
			autoTags: false,
			tweetDraft: false,
		});
		expect(prompt).toContain('"summary"');
		expect(prompt).toContain('"keyTopics"');
	});

	it("excludes disabled fields from the prompt", () => {
		const prompt = buildPrompt("Title", "Body", {
			summary: true,
			keyTopics: false,
			readingLevel: false,
			autoTags: false,
			tweetDraft: false,
		});
		expect(prompt).not.toContain('"keyTopics"');
		expect(prompt).not.toContain('"readingLevel"');
		expect(prompt).not.toContain('"autoTags"');
		expect(prompt).not.toContain('"tweetDraft"');
	});

	it("includes the title and the extracted body text", () => {
		const prompt = buildPrompt("My Article", "The body text here.", ALL_ON);
		expect(prompt).toContain("Article title: My Article");
		expect(prompt).toContain("Article body: The body text here.");
	});

	it("handles Portable Text body extraction end to end", () => {
		const bodyText = extractText([block("Portable text para.")]);
		const prompt = buildPrompt("T", bodyText, ALL_ON);
		expect(prompt).toContain("Article body: Portable text para.");
	});

	it("asks for JSON only", () => {
		const prompt = buildPrompt("T", "B", ALL_ON);
		expect(prompt).toContain("Return only valid JSON, no markdown, no explanation.");
	});

	it("truncates a very long body", () => {
		const long = "word ".repeat(MAX_BODY_CHARS);
		const prompt = buildPrompt("T", long, ALL_ON);
		expect(prompt.length).toBeLessThan(long.length);
		expect(prompt).toContain("...");
	});
});

describe("enabledFields", () => {
	it("returns the enabled field names in a stable order", () => {
		expect(enabledFields(DEFAULT_ENRICHMENTS)).toEqual([
			"summary",
			"keyTopics",
			"autoTags",
			"tweetDraft",
		]);
	});
});

// ── Response parsing ──

describe("response parsing", () => {
	it("parses a valid JSON response", () => {
		const result = parseEnrichmentResponse(
			JSON.stringify({
				summary: "A summary.",
				keyTopics: ["a", "b"],
				readingLevel: "Grade 10",
				autoTags: ["javascript"],
				tweetDraft: "Read this.",
			}),
			ALL_ON,
		);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.value).toEqual({
			summary: "A summary.",
			keyTopics: ["a", "b"],
			readingLevel: "Grade 10",
			autoTags: ["javascript"],
			tweetDraft: "Read this.",
		});
	});

	it("tolerates a markdown-fenced JSON response", () => {
		const result = parseEnrichmentResponse(
			'```json\n{"summary": "Fenced."}\n```',
			DEFAULT_ENRICHMENTS,
		);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.value.summary).toBe("Fenced.");
	});

	it("fails on invalid JSON", () => {
		const result = parseEnrichmentResponse("not json at all", ALL_ON);
		expect(result.ok).toBe(false);
	});

	it("fails when the JSON is not an object", () => {
		expect(parseEnrichmentResponse("[1,2,3]", ALL_ON).ok).toBe(false);
		expect(parseEnrichmentResponse('"a string"', ALL_ON).ok).toBe(false);
	});

	it("drops summary when it is not a string", () => {
		const result = parseEnrichmentResponse(JSON.stringify({ summary: 42 }), ALL_ON);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.value.summary).toBeUndefined();
	});

	it("drops keyTopics when it is not an array", () => {
		const result = parseEnrichmentResponse(
			JSON.stringify({ keyTopics: "a, b, c" }),
			ALL_ON,
		);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.value.keyTopics).toBeUndefined();
	});

	it("keeps only the string entries of an array field", () => {
		const result = parseEnrichmentResponse(
			JSON.stringify({ keyTopics: ["good", 7, null, "also good"] }),
			ALL_ON,
		);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.value.keyTopics).toEqual(["good", "also good"]);
	});

	it("normalises autoTags to lowercase, hyphenated, de-duplicated strings", () => {
		const result = parseEnrichmentResponse(
			JSON.stringify({ autoTags: ["JavaScript", "Static Site", "javascript"] }),
			ALL_ON,
		);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.value.autoTags).toEqual(["javascript", "static-site"]);
	});

	it("drops a tweetDraft over the character limit", () => {
		const result = parseEnrichmentResponse(
			JSON.stringify({ tweetDraft: "x".repeat(MAX_TWEET_LENGTH + 1) }),
			ALL_ON,
		);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.value.tweetDraft).toBeUndefined();
	});

	it("keeps a tweetDraft exactly at the character limit", () => {
		const draft = "x".repeat(MAX_TWEET_LENGTH);
		const result = parseEnrichmentResponse(JSON.stringify({ tweetDraft: draft }), ALL_ON);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.value.tweetDraft).toBe(draft);
	});

	it("handles missing optional fields in the response", () => {
		const result = parseEnrichmentResponse(JSON.stringify({ summary: "Only this." }), ALL_ON);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.value).toEqual({ summary: "Only this." });
	});

	it("ignores fields the config disabled even when the model returns them", () => {
		const result = parseEnrichmentResponse(
			JSON.stringify({ summary: "S", readingLevel: "Grade 4" }),
			{ ...ALL_ON, readingLevel: false },
		);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.value.readingLevel).toBeUndefined();
		expect(result.value.summary).toBe("S");
	});
});

// ── Configuration validation ──

describe("configuration validation", () => {
	it("rejects a config without an apiKey", () => {
		const result = validateConfig({ provider: "anthropic" });
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.error).toContain("apiKey");
	});

	it("rejects a blank apiKey", () => {
		const result = validateConfig({ provider: "anthropic", apiKey: "   " });
		expect(result.ok).toBe(false);
	});

	it("rejects a config without a provider", () => {
		const result = validateConfig({ apiKey: "sk-test" });
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.error).toContain("provider");
	});

	it("rejects an unknown provider", () => {
		expect(validateConfig({ provider: "gemini", apiKey: "sk-test" }).ok).toBe(false);
	});

	it("rejects a non-object config", () => {
		expect(validateConfig(null).ok).toBe(false);
		expect(validateConfig("anthropic").ok).toBe(false);
	});

	it("uses the provider default model when none is specified", () => {
		const anthropic = validateConfig({ provider: "anthropic", apiKey: "sk-test" });
		expect(anthropic.ok && anthropic.value.model).toBe(DEFAULT_MODEL.anthropic);
		const openai = validateConfig({ provider: "openai", apiKey: "sk-test" });
		expect(openai.ok && openai.value.model).toBe(DEFAULT_MODEL.openai);
	});

	it("keeps an explicit model", () => {
		const result = validateConfig({
			provider: "anthropic",
			apiKey: "sk-test",
			model: "claude-opus-5",
		});
		expect(result.ok && result.value.model).toBe("claude-opus-5");
	});

	it("applies the enrichment defaults and honours overrides", () => {
		const result = validateConfig({
			provider: "anthropic",
			apiKey: "sk-test",
			enrichments: { readingLevel: true, tweetDraft: false },
		});
		expect(result.ok && result.value.enrichments).toEqual({
			...DEFAULT_ENRICHMENTS,
			readingLevel: true,
			tweetDraft: false,
		});
	});
});

describe("resolveEnrichments", () => {
	it("falls back to the defaults for anything unset", () => {
		expect(resolveEnrichments(undefined)).toEqual(DEFAULT_ENRICHMENTS);
		expect(resolveEnrichments({ summary: false })).toEqual({
			...DEFAULT_ENRICHMENTS,
			summary: false,
		});
	});

	it("ignores non-boolean values", () => {
		expect(resolveEnrichments({ summary: "yes" })).toEqual(DEFAULT_ENRICHMENTS);
	});
});

describe("parseEnrichmentSelection", () => {
	it("turns an array of field names into flags", () => {
		expect(parseEnrichmentSelection(["summary", "autoTags"])).toEqual({
			summary: true,
			keyTopics: false,
			readingLevel: false,
			autoTags: true,
			tweetDraft: false,
		});
	});

	it("accepts a comma-separated string", () => {
		expect(parseEnrichmentSelection("summary, tweetDraft").tweetDraft).toBe(true);
	});

	it("turns everything off for an empty or unrecognised selection", () => {
		expect(parseEnrichmentSelection(undefined)).toEqual({
			summary: false,
			keyTopics: false,
			readingLevel: false,
			autoTags: false,
			tweetDraft: false,
		});
	});
});

// ── Provider requests ──

describe("buildRequest", () => {
	it("shapes an Anthropic messages request", () => {
		const spec = buildRequest("anthropic", "sk-ant", "claude-haiku-4-5", "PROMPT");
		expect(spec.url).toBe("https://api.anthropic.com/v1/messages");
		const headers = spec.init.headers as Record<string, string>;
		expect(headers["x-api-key"]).toBe("sk-ant");
		expect(headers["anthropic-version"]).toBe("2023-06-01");
		const body = JSON.parse(spec.init.body as string);
		expect(body.model).toBe("claude-haiku-4-5");
		expect(body.messages[0].content).toBe("PROMPT");
	});

	it("shapes an OpenAI chat completions request", () => {
		const spec = buildRequest("openai", "sk-oai", "gpt-4o-mini", "PROMPT");
		expect(spec.url).toBe("https://api.openai.com/v1/chat/completions");
		const headers = spec.init.headers as Record<string, string>;
		expect(headers.authorization).toBe("Bearer sk-oai");
		const body = JSON.parse(spec.init.body as string);
		expect(body.model).toBe("gpt-4o-mini");
	});

	it("never puts the key in the URL", () => {
		expect(buildRequest("openai", "sk-oai", "m", "p").url).not.toContain("sk-oai");
	});
});

describe("extractCompletion", () => {
	it("reads the text and token count from an Anthropic payload", () => {
		const result = extractCompletion("anthropic", {
			content: [{ type: "text", text: "hello" }],
			usage: { input_tokens: 100, output_tokens: 20 },
		});
		expect(result).toEqual({ text: "hello", tokens: 120 });
	});

	it("reads the text and token count from an OpenAI payload", () => {
		const result = extractCompletion("openai", {
			choices: [{ message: { content: "hello" } }],
			usage: { total_tokens: 90 },
		});
		expect(result).toEqual({ text: "hello", tokens: 90 });
	});

	it("returns null for a malformed payload", () => {
		expect(extractCompletion("anthropic", { content: [] })).toBeNull();
		expect(extractCompletion("anthropic", null)).toBeNull();
		expect(extractCompletion("openai", { choices: [] })).toBeNull();
		expect(extractCompletion("openai", { choices: [{}] })).toBeNull();
	});

	it("reports a null token count when usage is absent", () => {
		const result = extractCompletion("openai", {
			choices: [{ message: { content: "hi" } }],
		});
		expect(result?.tokens).toBeNull();
	});
});

describe("classifyStatus", () => {
	it("maps statuses onto failure kinds", () => {
		expect(classifyStatus(429)).toBe("rate_limit");
		expect(classifyStatus(402)).toBe("quota");
		expect(classifyStatus(401)).toBe("auth");
		expect(classifyStatus(403)).toBe("auth");
		expect(classifyStatus(500)).toBe("server");
		expect(classifyStatus(400)).toBe("client");
	});
});

// ── Descriptor ──

describe("enrichkitPlugin descriptor", () => {
	it("declares the canonical capabilities", () => {
		const descriptor = enrichkitPlugin({ provider: "anthropic", apiKey: "sk-test" });
		expect(descriptor.capabilities).toEqual(["content:read", "content:write", "network:request"]);
	});

	it("narrows allowedHosts to the configured provider", () => {
		expect(providerHosts("anthropic")).toEqual(["api.anthropic.com"]);
		expect(providerHosts("openai")).toEqual(["api.openai.com"]);
	});

	it("allows both provider hosts when no provider is configured yet", () => {
		expect(providerHosts(undefined)).toEqual(["api.anthropic.com", "api.openai.com"]);
	});

	it("points at the sandbox entrypoint", () => {
		const descriptor = enrichkitPlugin({ provider: "openai", apiKey: "sk-test" });
		expect(descriptor.id).toBe("enrichkit");
		expect(descriptor.entrypoint).toBe("@plugdash/enrichkit/sandbox");
		expect(descriptor.allowedHosts).toEqual(["api.openai.com"]);
	});
});
