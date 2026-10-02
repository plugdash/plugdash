export interface HeartState {
	count: number;
	hearted: boolean;
}

/** EmDash wraps plugin route replies as { success, data }. Accept wrapped or bare. */
export function unwrap(json: unknown): Record<string, unknown> | null {
	if (!json || typeof json !== "object") return null;
	const j = json as Record<string, unknown>;
	if (j.success === false) return null;
	const d = "data" in j ? j.data : j;
	return d && typeof d === "object" ? (d as Record<string, unknown>) : null;
}

/** Parse a route reply. Returns null on failure so the caller keeps its current UI. */
export function parseHeartResponse(json: unknown): Partial<HeartState> | null {
	const d = unwrap(json);
	if (!d) return null;
	const out: Partial<HeartState> = {};
	if (typeof d.count === "number") out.count = d.count;
	if (typeof d.hearted === "boolean") out.hearted = d.hearted;
	return out;
}

/** Entry id for the heart: the ULID when present, else the slug (rule G). */
export function heartId(post: Record<string, unknown> | null | undefined): string | undefined {
	const data = post?.data as Record<string, unknown> | undefined;
	const id = data?.id ?? post?.id;
	return typeof id === "string" && id ? id : undefined;
}

const counts = new Map<string, Promise<number>>();

/** One heart-status request per post id per page, shared by every button. */
export function fetchCount(
	id: string,
	legacyId: string | null,
	doFetch: typeof fetch = fetch,
): Promise<number> {
	let p = counts.get(id);
	if (!p) {
		let q = `id=${encodeURIComponent(id)}`;
		if (legacyId) q += `&legacyId=${encodeURIComponent(legacyId)}`;
		p = doFetch(`/_emdash/api/plugins/heartpost/heart-status?${q}`)
			.then(async (res) => (res.ok ? (parseHeartResponse(await res.json())?.count ?? 0) : 0))
			.catch(() => 0);
		counts.set(id, p);
	}
	return p;
}

export function resetCounts() {
	counts.clear();
}
