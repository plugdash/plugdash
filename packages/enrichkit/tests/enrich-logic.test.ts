import { describe, it, expect } from "vitest";
import {
	DEFAULT_ENRICHMENTS,
	MAX_BODY_CHARS,
	TOOL_NAME,
	buildPrompt,
	buildRequest,
	classifyStatus,
	contentHash,
	extractText,
	isBlockedHostError,
	parseResponse,
	pickBody,
	resolveEnrichments,
	type EnrichmentFlags,
} from "../src/enrich-logic.ts";

const ALL_ON: EnrichmentFlags = {
	summary: true,
	keyTopics: true,
	readingLevel: true,
	autoTags: true,
	tweetDraft: true,
};

const pt = (text: string) => [{ _type: "block", children: [{ _type: "span", text }] }];

describe("pickBody (rule F)", () => {
	it("uses the field option when given", () => {
		expect(pickBody({ content: pt("a"), story: pt("b") }, "story")).toEqual(pt("b"));
	});
	it("prefers content, then body, then the first Portable Text array", () => {
		expect(pickBody({ body: pt("b"), content: pt("c") })).toEqual(pt("c"));
		expect(pickBody({ body: pt("b") })).toEqual(pt("b"));
		expect(pickBody({ tags: ["x"], article: pt("a") })).toEqual(pt("a"));
		expect(pickBody({ title: "no body" })).toBeUndefined();
	});
});

describe("extractText", () => {
	it("joins block spans and skips non-block nodes", () => {
		const body = [...pt("one"), { _type: "image" }, ...pt("two")];
		expect(extractText(body)).toBe("one\n\ntwo");
		expect(extractText("nope")).toBe("");
	});
});

describe("resolveEnrichments", () => {
	it("fills defaults for unset flags", () => {
		expect(resolveEnrichments(undefined)).toEqual(DEFAULT_ENRICHMENTS);
		expect(resolveEnrichments({ readingLevel: true }).readingLevel).toBe(true);
	});
});

describe("contentHash", () => {
	it("is stable and changes with model, flags, title or body", async () => {
		const base = await contentHash("m", ALL_ON, "t", "b");
		expect(await contentHash("m", ALL_ON, "t", "b")).toBe(base);
		expect(base).toMatch(/^[0-9a-f]{64}$/);
		expect(await contentHash("m2", ALL_ON, "t", "b")).not.toBe(base);
		expect(await contentHash("m", DEFAULT_ENRICHMENTS, "t", "b")).not.toBe(base);
		expect(await contentHash("m", ALL_ON, "t2", "b")).not.toBe(base);
		expect(await contentHash("m", ALL_ON, "t", "b2")).not.toBe(base);
	});
});

describe("buildPrompt", () => {
	it("caps the body", () => {
		expect(buildPrompt("T", "x".repeat(MAX_BODY_CHARS + 50)).length).toBeLessThan(
			MAX_BODY_CHARS + 200,
		);
	});
});

describe("buildRequest", () => {
	it("forces one tool call for anthropic", () => {
		const spec = buildRequest("anthropic", "k", "claude-haiku-4-5", "p", DEFAULT_ENRICHMENTS);
		expect(spec.url).toBe("https://api.anthropic.com/v1/messages");
		const body = JSON.parse(String(spec.init.body));
		expect(body.tool_choice).toEqual({ type: "tool", name: TOOL_NAME });
		expect(body.tools[0].input_schema.required).toEqual(["summary", "topics", "tags", "tweet"]);
		expect(body.tools[0].input_schema.additionalProperties).toBe(false);
	});
	it("uses a strict json_schema for openai", () => {
		const spec = buildRequest("openai", "k", "gpt-4o-mini", "p", ALL_ON);
		expect(spec.url).toBe("https://api.openai.com/v1/chat/completions");
		const body = JSON.parse(String(spec.init.body));
		expect(body.response_format.type).toBe("json_schema");
		expect(body.response_format.json_schema.strict).toBe(true);
		expect(body.response_format.json_schema.schema.required).toContain("readingLevel");
	});
});

describe("parseResponse", () => {
	it("reads the anthropic tool_use block", () => {
		const out = parseResponse(
			"anthropic",
			{
				content: [
					{ type: "text", text: "ignored" },
					{
						type: "tool_use",
						name: TOOL_NAME,
						input: { summary: " S ", topics: ["a"], tags: ["Big Data"], tweet: "t" },
					},
				],
				usage: { input_tokens: 10, output_tokens: 5 },
			},
			DEFAULT_ENRICHMENTS,
		);
		expect(out).toEqual({
			ok: true,
			value: { summary: "S", topics: ["a"], tags: ["big-data"], tweet: "t" },
			tokens: 15,
		});
	});
	it("reads openai message content as JSON", () => {
		const out = parseResponse(
			"openai",
			{ choices: [{ message: { content: '{"summary":"S"}' } }], usage: { total_tokens: 3 } },
			ALL_ON,
		);
		expect(out).toEqual({ ok: true, value: { summary: "S" }, tokens: 3 });
	});
	it("fails on a reply with no usable structured output", () => {
		expect(parseResponse("anthropic", { content: [{ type: "text", text: "hi" }] }, ALL_ON).ok).toBe(
			false,
		);
		expect(
			parseResponse("openai", { choices: [{ message: { content: "not json" } }] }, ALL_ON).ok,
		).toBe(false);
		expect(
			parseResponse(
				"anthropic",
				{ content: [{ type: "tool_use", name: TOOL_NAME, input: {} }] },
				ALL_ON,
			).ok,
		).toBe(false);
	});
	it("drops over-length tweets and disabled fields", () => {
		const out = parseResponse(
			"openai",
			{
				choices: [
					{
						message: {
							content: JSON.stringify({ summary: "S", tweet: "x".repeat(281), readingLevel: "G8" }),
						},
					},
				],
			},
			DEFAULT_ENRICHMENTS,
		);
		expect(out).toEqual({ ok: true, value: { summary: "S" }, tokens: null });
	});
});

describe("errors", () => {
	it("classifies status codes", () => {
		expect(classifyStatus(429)).toBe("rate_limit");
		expect(classifyStatus(401)).toBe("auth");
		expect(classifyStatus(503)).toBe("server");
	});
	it("recognises EmDash host refusals", () => {
		expect(
			isBlockedHostError(new Error('Plugin "enrichkit" is not allowed to fetch from host "x"')),
		).toBe(true);
		expect(isBlockedHostError(new Error('Plugin "enrichkit": blocked fetch to "x": private'))).toBe(
			true,
		);
		expect(isBlockedHostError(new Error("socket hang up"))).toBe(false);
	});
});
