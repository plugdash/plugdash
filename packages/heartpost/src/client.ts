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
