// A small client for the EmDash REST API at /_emdash/api.
//
// Mirrors what the `emdash` CLI sends: a Bearer token (or a session cookie for
// local testing), plus `X-EmDash-Request: 1` and `Origin` on writes to pass the
// CSRF and Astro origin checks. Responses are `{ success, data }` or
// `{ success: false, error: { code, message } }`.

export interface ApiOptions {
	/** Site origin, e.g. https://example.com */
	url: string;
	/** API token (ec_pat_...) or OAuth access token. */
	token?: string;
	/** Raw Cookie header, for a dev-bypass session. */
	cookie?: string;
	fetch?: typeof fetch;
}

export class ApiError extends Error {
	constructor(
		readonly status: number,
		readonly code: string,
		message: string,
	) {
		super(message);
	}
}

export interface CollectionField {
	slug: string;
	type: string;
}

export interface Collection {
	slug: string;
	fields?: CollectionField[];
}

export interface Taxonomy {
	name: string;
	collections?: string[];
}

export interface MediaItem {
	id: string;
	url: string;
	filename: string;
	mimeType: string;
	storageKey: string;
	width?: number | null;
	height?: number | null;
}

export interface EntryInput {
	slug: string;
	data: Record<string, unknown>;
	createdAt?: string;
	publishedAt?: string;
	seo?: { title?: string; description?: string };
	taxonomies?: Record<string, string[]>;
}

export type Api = ReturnType<typeof createApi>;

export function createApi(options: ApiOptions) {
	const base = `${options.url.replace(/\/+$/, "")}/_emdash/api`;
	const origin = new URL(options.url).origin;
	const doFetch = options.fetch ?? fetch;

	async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
		const headers: Record<string, string> = { Accept: "application/json" };
		if (options.token) headers["Authorization"] = `Bearer ${options.token}`;
		if (options.cookie) headers["Cookie"] = options.cookie;
		if (method !== "GET") {
			headers["X-EmDash-Request"] = "1";
			headers["Origin"] = origin;
		}
		let payload: BodyInit | undefined;
		if (body instanceof FormData) {
			payload = body;
		} else if (body !== undefined) {
			headers["Content-Type"] = "application/json";
			payload = JSON.stringify(body);
		}

		const res = await doFetch(`${base}${path}`, { method, headers, body: payload });
		const json = (await res.json().catch(() => null)) as {
			data?: T;
			error?: { code?: string; message?: string };
		} | null;
		if (!res.ok) {
			throw new ApiError(
				res.status,
				json?.error?.code ?? "HTTP_ERROR",
				json?.error?.message ?? `${method} ${path} failed with ${res.status}`,
			);
		}
		return json?.data as T;
	}

	const enc = encodeURIComponent;

	return {
		async collection(slug: string): Promise<Collection | null> {
			try {
				const data = await call<{ item: Collection }>(
					"GET",
					`/schema/collections/${enc(slug)}?includeFields=true`,
				);
				return data.item;
			} catch (error) {
				if (error instanceof ApiError && error.status === 404) return null;
				throw error;
			}
		},

		/** Looks an entry up by slug. Returns null when there is none. */
		async findEntry(collection: string, slug: string): Promise<{ id: string } | null> {
			try {
				const data = await call<{ item: { id: string } }>(
					"GET",
					`/content/${enc(collection)}/${enc(slug)}`,
				);
				return data.item;
			} catch (error) {
				if (error instanceof ApiError && error.status === 404) return null;
				throw error;
			}
		},

		async createEntry(collection: string, input: EntryInput): Promise<{ id: string }> {
			const data = await call<{ item: { id: string } }>(
				"POST",
				`/content/${enc(collection)}`,
				input,
			);
			return data.item;
		},

		async publish(collection: string, id: string): Promise<void> {
			await call("POST", `/content/${enc(collection)}/${enc(id)}/publish`, {});
		},

		async taxonomies(): Promise<Taxonomy[]> {
			const data = await call<{ taxonomies: Taxonomy[] }>("GET", "/taxonomies");
			return data.taxonomies;
		},

		async termSlugs(taxonomy: string): Promise<Set<string>> {
			const data = await call<{ terms: { slug: string }[] }>(
				"GET",
				`/taxonomies/${enc(taxonomy)}/terms?includeCounts=false`,
			);
			return new Set(data.terms.map((term) => term.slug));
		},

		async createTerm(taxonomy: string, slug: string, label: string): Promise<void> {
			await call("POST", `/taxonomies/${enc(taxonomy)}/terms`, { slug, label });
		},

		async uploadMedia(file: Blob, filename: string, alt?: string): Promise<MediaItem> {
			const form = new FormData();
			form.append("file", file, filename);
			if (alt) form.append("alt", alt);
			const data = await call<{ item: MediaItem }>("POST", "/media", form);
			return data.item;
		},
	};
}
