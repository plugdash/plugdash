// Pure enrichment logic: body text, prompt, provider request with structured
// output, response parsing and the change hash. No network, no EmDash calls,
// so all of it is unit-tested directly.

export type EnrichkitProvider = "anthropic" | "openai";

export interface EnrichmentFlags {
	summary: boolean;
	keyTopics: boolean;
	readingLevel: boolean;
	autoTags: boolean;
	tweetDraft: boolean;
}

/** What gets stored in KV `result:<id>`. Only enabled, valid fields are set. */
export interface Enrichment {
	summary?: string;
	topics?: string[];
	tags?: string[];
	readingLevel?: string;
	tweet?: string;
}

export const DEFAULT_ENRICHMENTS: EnrichmentFlags = {
	summary: true,
	keyTopics: true,
	readingLevel: false,
	autoTags: true,
	tweetDraft: true,
};

export const DEFAULT_MODEL: Record<EnrichkitProvider, string> = {
	anthropic: "claude-haiku-4-5",
	openai: "gpt-4o-mini",
};

export const PROVIDER_HOSTS: Record<EnrichkitProvider, string> = {
	anthropic: "api.anthropic.com",
	openai: "api.openai.com",
};

/** Articles shorter than this are not worth an API call. */
export const MIN_WORDS = 100;

export const MAX_TWEET_LENGTH = 280;

/** Body text sent to the model is capped so a long article cannot blow the token budget. */
export const MAX_BODY_CHARS = 12000;

export const TOOL_NAME = "save_enrichment";

type Flag = keyof EnrichmentFlags;

/** Option flag -> property name in the schema and in the stored result. */
const FIELDS: Array<{ flag: Flag; key: keyof Enrichment; schema: Record<string, unknown> }> = [
	{
		flag: "summary",
		key: "summary",
		schema: { type: "string", description: "A 2-3 sentence summary of the main argument" },
	},
	{
		flag: "keyTopics",
		key: "topics",
		schema: {
			type: "array",
			items: { type: "string" },
			description: "3-5 main topics as short noun phrases",
		},
	},
	{
		flag: "autoTags",
		key: "tags",
		schema: {
			type: "array",
			items: { type: "string" },
			description: "3-8 lowercase tags for content discovery, no spaces",
		},
	},
	{
		flag: "readingLevel",
		key: "readingLevel",
		schema: { type: "string", description: 'Estimated grade level, e.g. "Grade 8" or "College"' },
	},
	{
		flag: "tweetDraft",
		key: "tweet",
		schema: {
			type: "string",
			description: `A tweet under ${MAX_TWEET_LENGTH} characters that makes someone want to read the article`,
		},
	},
];

function isRecordValue(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Fills in the defaults for any enrichment flag the caller left unset. */
export function resolveEnrichments(input: unknown): EnrichmentFlags {
	const source = isRecordValue(input) ? input : {};
	const flags = { ...DEFAULT_ENRICHMENTS };
	for (const { flag } of FIELDS) {
		const value = source[flag];
		if (typeof value === "boolean") flags[flag] = value;
	}
	return flags;
}

export function enabledKeys(flags: EnrichmentFlags): Array<keyof Enrichment> {
	return FIELDS.filter((f) => flags[f.flag]).map((f) => f.key);
}

// ── Body text ──

function isPortableText(value: unknown): value is unknown[] {
	return Array.isArray(value) && value.some((item) => isRecordValue(item) && "_type" in item);
}

/**
 * Picks the Portable Text field: the `field` option if given, else `content`
 * (all official templates), else `body`, else the first array of `_type` items.
 */
export function pickBody(data: Record<string, unknown>, field?: string): unknown {
	if (field) return data[field];
	if (isPortableText(data.content)) return data.content;
	if (isPortableText(data.body)) return data.body;
	return Object.values(data).find(isPortableText);
}

/** Flattens Portable Text into plain text. Only `block` blocks carry prose. */
export function extractText(body: unknown): string {
	if (!Array.isArray(body)) return "";
	const paragraphs: string[] = [];
	for (const block of body) {
		if (!isRecordValue(block) || block._type !== "block") continue;
		const children = block.children;
		if (!Array.isArray(children)) continue;
		const text = children
			.filter((child): child is Record<string, unknown> => isRecordValue(child))
			.filter((child) => child._type === "span")
			.map((child) => (typeof child.text === "string" ? child.text : ""))
			.join("");
		if (text.trim().length > 0) paragraphs.push(text.trim());
	}
	return paragraphs.join("\n\n");
}

export function countWords(text: string): number {
	const trimmed = text.trim();
	return trimmed.length === 0 ? 0 : trimmed.split(/\s+/).length;
}

// ── Change hash ──

/** sha256(model + enrichments + title + body), hex. Same input, same hash, no call. */
export async function contentHash(
	model: string,
	flags: EnrichmentFlags,
	title: string,
	bodyText: string,
): Promise<string> {
	const input = model + JSON.stringify(flags) + title + bodyText;
	const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
	return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

// ── Prompt and request ──

export function buildSchema(flags: EnrichmentFlags): Record<string, unknown> {
	const fields = FIELDS.filter((f) => flags[f.flag]);
	return {
		type: "object",
		properties: Object.fromEntries(fields.map((f) => [f.key, f.schema])),
		required: fields.map((f) => f.key),
		additionalProperties: false,
	};
}

export function buildPrompt(title: string, bodyText: string): string {
	const body =
		bodyText.length > MAX_BODY_CHARS ? `${bodyText.slice(0, MAX_BODY_CHARS)}...` : bodyText;
	return [
		"Analyse the following article and fill in every field of the schema.",
		"",
		`Article title: ${title}`,
		"",
		`Article body: ${body}`,
	].join("\n");
}

export interface RequestSpec {
	url: string;
	init: RequestInit;
}

/**
 * Anthropic gets one forced tool call, OpenAI gets a strict json_schema
 * response format. Either way the reply is already structured, so there is
 * no "bad JSON, try again" path.
 */
export function buildRequest(
	provider: EnrichkitProvider,
	apiKey: string,
	model: string,
	prompt: string,
	flags: EnrichmentFlags,
): RequestSpec {
	const schema = buildSchema(flags);
	if (provider === "anthropic") {
		return {
			url: `https://${PROVIDER_HOSTS.anthropic}/v1/messages`,
			init: {
				method: "POST",
				headers: {
					"content-type": "application/json",
					"x-api-key": apiKey,
					"anthropic-version": "2023-06-01",
				},
				body: JSON.stringify({
					model,
					max_tokens: 1024,
					tools: [
						{
							name: TOOL_NAME,
							description: "Save the enrichment for this article",
							input_schema: schema,
						},
					],
					tool_choice: { type: "tool", name: TOOL_NAME },
					messages: [{ role: "user", content: prompt }],
				}),
			},
		};
	}
	return {
		url: `https://${PROVIDER_HOSTS.openai}/v1/chat/completions`,
		init: {
			method: "POST",
			headers: {
				"content-type": "application/json",
				authorization: `Bearer ${apiKey}`,
			},
			body: JSON.stringify({
				model,
				max_tokens: 1024,
				response_format: {
					type: "json_schema",
					json_schema: { name: TOOL_NAME, strict: true, schema },
				},
				messages: [{ role: "user", content: prompt }],
			}),
		},
	};
}

// ── Response ──

export type ParseResult =
	| { ok: true; value: Enrichment; tokens: number | null }
	| { ok: false; error: string };

function stringArray(value: unknown): string[] | null {
	if (!Array.isArray(value)) return null;
	const cleaned = value
		.filter((item): item is string => typeof item === "string")
		.map((item) => item.trim())
		.filter((item) => item.length > 0);
	return cleaned.length > 0 ? cleaned : null;
}

function nonEmpty(value: unknown): string | null {
	return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

/** Keeps only enabled fields that pass their type check. */
export function validateFields(input: Record<string, unknown>, flags: EnrichmentFlags): Enrichment {
	const value: Enrichment = {};
	const summary = nonEmpty(input.summary);
	if (flags.summary && summary) value.summary = summary;
	const topics = stringArray(input.topics);
	if (flags.keyTopics && topics) value.topics = topics;
	const tags = stringArray(input.tags);
	if (flags.autoTags && tags) {
		value.tags = [...new Set(tags.map((tag) => tag.toLowerCase().replace(/\s+/g, "-")))];
	}
	const level = nonEmpty(input.readingLevel);
	if (flags.readingLevel && level) value.readingLevel = level;
	const tweet = nonEmpty(input.tweet);
	// Over-length tweets are dropped, not cut mid-word.
	if (flags.tweetDraft && tweet && tweet.length <= MAX_TWEET_LENGTH) value.tweet = tweet;
	return value;
}

/** Reads the structured reply. A bad reply is a failure, never a second call. */
export function parseResponse(
	provider: EnrichkitProvider,
	payload: unknown,
	flags: EnrichmentFlags,
): ParseResult {
	if (!isRecordValue(payload)) return { ok: false, error: "response was not a JSON object" };
	const usage = isRecordValue(payload.usage) ? payload.usage : {};

	let input: unknown;
	let tokens: number | null;
	if (provider === "anthropic") {
		const content = Array.isArray(payload.content) ? payload.content : [];
		const tool = content.find(
			(part): part is Record<string, unknown> =>
				isRecordValue(part) && part.type === "tool_use" && part.name === TOOL_NAME,
		);
		if (!tool) return { ok: false, error: "no tool_use block in response" };
		input = tool.input;
		const sum = Number(usage.input_tokens ?? 0) + Number(usage.output_tokens ?? 0);
		tokens = sum > 0 ? sum : null;
	} else {
		const choices = Array.isArray(payload.choices) ? payload.choices : [];
		const message = isRecordValue(choices[0]) ? choices[0].message : null;
		const text = isRecordValue(message) ? message.content : null;
		if (typeof text !== "string") return { ok: false, error: "no message content in response" };
		try {
			input = JSON.parse(text);
		} catch {
			return { ok: false, error: "message content was not valid JSON" };
		}
		tokens = typeof usage.total_tokens === "number" ? usage.total_tokens : null;
	}

	if (!isRecordValue(input)) return { ok: false, error: "structured output was not an object" };
	const value = validateFields(input, flags);
	if (Object.keys(value).length === 0) return { ok: false, error: "no usable fields in response" };
	return { ok: true, value, tokens };
}

// ── Errors ──

export type ApiFailure = "rate_limit" | "quota" | "auth" | "server" | "client";

export function classifyStatus(status: number): ApiFailure {
	if (status === 429) return "rate_limit";
	if (status === 402) return "quota";
	if (status === 401 || status === 403) return "auth";
	if (status >= 500) return "server";
	return "client";
}

/**
 * EmDash's ctx.http.fetch throws "not allowed to fetch from host" for hosts
 * outside allowedHosts, and "blocked fetch" when the SSRF guard refuses one.
 */
export function isBlockedHostError(err: unknown): boolean {
	return /not allowed to fetch from host|blocked fetch|no allowed hosts/i.test(String(err));
}
