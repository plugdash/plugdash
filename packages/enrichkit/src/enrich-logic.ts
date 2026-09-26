// Pure enrichment logic: prompt construction, provider request shaping, and
// LLM response parsing. Everything here is synchronous and side-effect free
// so it can be unit-tested without touching the network. The sandbox entry
// keeps only the HTTP plumbing and the KV/metadata writes.

export type EnrichkitProvider = "anthropic" | "openai";

export interface EnrichmentFlags {
	summary: boolean;
	keyTopics: boolean;
	readingLevel: boolean;
	autoTags: boolean;
	tweetDraft: boolean;
}

export interface Enrichment {
	summary?: string;
	keyTopics?: string[];
	readingLevel?: string;
	autoTags?: string[];
	tweetDraft?: string;
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

/**
 * Body text sent to the model is capped so a long article cannot blow the
 * token budget. The opening of an article carries the argument; the tail
 * rarely changes the summary.
 */
export const MAX_BODY_CHARS = 12000;

const FIELD_ORDER: Array<keyof EnrichmentFlags> = [
	"summary",
	"keyTopics",
	"readingLevel",
	"autoTags",
	"tweetDraft",
];

const FIELD_PROMPTS: Record<keyof EnrichmentFlags, string> = {
	summary: '- "summary": a 2-3 sentence summary of the main argument',
	keyTopics: '- "keyTopics": an array of 3-5 main topics (short noun phrases)',
	readingLevel: '- "readingLevel": the estimated grade level (e.g. "Grade 8", "College")',
	autoTags: '- "autoTags": an array of 3-8 tags for content discovery (lowercase, no spaces)',
	tweetDraft: `- "tweetDraft": a tweet under ${MAX_TWEET_LENGTH} characters that makes someone want to read the article`,
};

function isRecordValue(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

// ── Config ──

export interface ResolvedEnrichkitConfig {
	provider: EnrichkitProvider;
	apiKey: string;
	model: string;
	enrichments: EnrichmentFlags;
}

export type ConfigResult =
	| { ok: true; value: ResolvedEnrichkitConfig }
	| { ok: false; error: string };

/** Fills in the defaults for any enrichment flag the caller left unset. */
export function resolveEnrichments(input: unknown): EnrichmentFlags {
	const source = isRecordValue(input) ? input : {};
	const flags = { ...DEFAULT_ENRICHMENTS };
	for (const field of FIELD_ORDER) {
		const value = source[field];
		if (typeof value === "boolean") flags[field] = value;
	}
	return flags;
}

/**
 * Turns an admin checkbox selection (an array of field names, or the
 * comma-separated string some form transports send) into a flag set.
 * Anything not selected is off.
 */
export function parseEnrichmentSelection(input: unknown): EnrichmentFlags {
	let names: string[];
	if (Array.isArray(input)) {
		names = input.filter((item): item is string => typeof item === "string");
	} else if (typeof input === "string") {
		names = input.split(",").map((item) => item.trim());
	} else {
		names = [];
	}
	const flags: EnrichmentFlags = {
		summary: false,
		keyTopics: false,
		readingLevel: false,
		autoTags: false,
		tweetDraft: false,
	};
	for (const field of FIELD_ORDER) {
		if (names.includes(field)) flags[field] = true;
	}
	return flags;
}

/**
 * Validates a raw config object (from build-time options or from KV) and
 * fills in the model default for the chosen provider.
 */
export function validateConfig(input: unknown): ConfigResult {
	const source = isRecordValue(input) ? input : {};

	const provider = source.provider;
	if (provider !== "anthropic" && provider !== "openai") {
		return { ok: false, error: 'provider must be "anthropic" or "openai"' };
	}

	const apiKey = source.apiKey;
	if (typeof apiKey !== "string" || apiKey.trim().length === 0) {
		return { ok: false, error: "apiKey is required" };
	}

	const modelRaw = source.model;
	const model =
		typeof modelRaw === "string" && modelRaw.trim().length > 0
			? modelRaw.trim()
			: DEFAULT_MODEL[provider];

	return {
		ok: true,
		value: {
			provider,
			apiKey: apiKey.trim(),
			model,
			enrichments: resolveEnrichments(source.enrichments),
		},
	};
}

// ── Body text ──

/**
 * Flattens a Portable Text body into plain text. Only `block` blocks carry
 * prose, so images, code, and breaks are skipped: they would inflate the
 * word count without giving the model anything to summarise.
 */
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
	if (trimmed.length === 0) return 0;
	return trimmed.split(/\s+/).length;
}

// ── Prompt ──

export function enabledFields(flags: EnrichmentFlags): Array<keyof EnrichmentFlags> {
	return FIELD_ORDER.filter((field) => flags[field]);
}

/**
 * Builds the single prompt covering every enabled enrichment. Disabled
 * fields are left out entirely so the model does not spend tokens on them.
 */
export function buildPrompt(title: string, bodyText: string, flags: EnrichmentFlags): string {
	const fields = enabledFields(flags);
	const body =
		bodyText.length > MAX_BODY_CHARS ? `${bodyText.slice(0, MAX_BODY_CHARS)}...` : bodyText;
	return [
		"You are a content enrichment assistant. Analyse the following article and return ONLY a JSON object with these fields:",
		"",
		...fields.map((field) => FIELD_PROMPTS[field]),
		"",
		"Return only valid JSON, no markdown, no explanation.",
		"",
		`Article title: ${title}`,
		"",
		`Article body: ${body}`,
	].join("\n");
}

// ── Provider request ──

export interface RequestSpec {
	url: string;
	init: RequestInit;
}

export function buildRequest(
	provider: EnrichkitProvider,
	apiKey: string,
	model: string,
	prompt: string,
): RequestSpec {
	if (provider === "anthropic") {
		return {
			url: "https://api.anthropic.com/v1/messages",
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
					messages: [{ role: "user", content: prompt }],
				}),
			},
		};
	}
	return {
		url: "https://api.openai.com/v1/chat/completions",
		init: {
			method: "POST",
			headers: {
				"content-type": "application/json",
				authorization: `Bearer ${apiKey}`,
			},
			body: JSON.stringify({
				model,
				max_tokens: 1024,
				messages: [{ role: "user", content: prompt }],
			}),
		},
	};
}

export interface Completion {
	text: string;
	tokens: number | null;
}

/** Pulls the assistant text and the token count out of a provider payload. */
export function extractCompletion(provider: EnrichkitProvider, payload: unknown): Completion | null {
	if (!isRecordValue(payload)) return null;

	if (provider === "anthropic") {
		const content = payload.content;
		if (!Array.isArray(content)) return null;
		const text = content
			.filter((part): part is Record<string, unknown> => isRecordValue(part))
			.filter((part) => part.type === "text")
			.map((part) => (typeof part.text === "string" ? part.text : ""))
			.join("");
		if (text.length === 0) return null;
		const usage = isRecordValue(payload.usage) ? payload.usage : null;
		const input = typeof usage?.input_tokens === "number" ? usage.input_tokens : 0;
		const output = typeof usage?.output_tokens === "number" ? usage.output_tokens : 0;
		const tokens = input + output;
		return { text, tokens: tokens > 0 ? tokens : null };
	}

	const choices = payload.choices;
	if (!Array.isArray(choices)) return null;
	const first = choices[0];
	if (!isRecordValue(first)) return null;
	const message = isRecordValue(first.message) ? first.message : null;
	const text = typeof message?.content === "string" ? message.content : "";
	if (text.length === 0) return null;
	const usage = isRecordValue(payload.usage) ? payload.usage : null;
	const tokens = typeof usage?.total_tokens === "number" ? usage.total_tokens : null;
	return { text, tokens };
}

// ── Response parsing ──

export type ParseResult = { ok: true; value: Enrichment } | { ok: false; error: string };

/**
 * Models sometimes wrap JSON in a markdown fence despite being told not to.
 * Cheaper to peel it off here than to burn the one retry on it.
 */
function stripFence(raw: string): string {
	const match = /^\s*```(?:json)?\s*([\s\S]*?)\s*```\s*$/.exec(raw);
	return match?.[1] ?? raw;
}

function stringArray(value: unknown): string[] | null {
	if (!Array.isArray(value)) return null;
	const items = value.filter((item): item is string => typeof item === "string");
	const cleaned = items.map((item) => item.trim()).filter((item) => item.length > 0);
	return cleaned.length > 0 ? cleaned : null;
}

/**
 * Parses the model's JSON reply and keeps only enabled fields that pass
 * their type check. A field that fails validation is dropped - only
 * unparseable JSON fails the whole response (and earns the one retry).
 */
export function parseEnrichmentResponse(raw: string, flags: EnrichmentFlags): ParseResult {
	let payload: unknown;
	try {
		payload = JSON.parse(stripFence(raw));
	} catch {
		return { ok: false, error: "response was not valid JSON" };
	}
	if (!isRecordValue(payload)) {
		return { ok: false, error: "response was not a JSON object" };
	}

	const value: Enrichment = {};

	if (flags.summary && typeof payload.summary === "string" && payload.summary.trim().length > 0) {
		value.summary = payload.summary.trim();
	}

	if (flags.keyTopics) {
		const topics = stringArray(payload.keyTopics);
		if (topics) value.keyTopics = topics;
	}

	if (
		flags.readingLevel &&
		typeof payload.readingLevel === "string" &&
		payload.readingLevel.trim().length > 0
	) {
		value.readingLevel = payload.readingLevel.trim();
	}

	if (flags.autoTags) {
		const tags = stringArray(payload.autoTags);
		// Tags are for discovery, so they are normalised rather than rejected:
		// lowercased and de-spaced to match the shape the prompt asks for.
		if (tags) {
			const normalised = [
				...new Set(tags.map((tag) => tag.toLowerCase().replace(/\s+/g, "-"))),
			];
			value.autoTags = normalised;
		}
	}

	if (
		flags.tweetDraft &&
		typeof payload.tweetDraft === "string" &&
		payload.tweetDraft.trim().length > 0 &&
		payload.tweetDraft.trim().length <= MAX_TWEET_LENGTH
	) {
		// Over-length drafts are dropped, not truncated: a tweet cut mid-word
		// is worse than no tweet.
		value.tweetDraft = payload.tweetDraft.trim();
	}

	return { ok: true, value };
}

// ── Error classification ──

export type ApiFailure = "rate_limit" | "quota" | "auth" | "server" | "client";

/** Maps an HTTP status onto how the hook should log and whether to retry. */
export function classifyStatus(status: number): ApiFailure {
	if (status === 429) return "rate_limit";
	if (status === 402) return "quota";
	if (status === 401 || status === 403) return "auth";
	if (status >= 500) return "server";
	return "client";
}
