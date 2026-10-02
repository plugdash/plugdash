// Shared by the plugin hook and CopyLink.astro, so both always agree on the
// short path for an entry. No imports: the component loads this file at
// render time and must not pull in emdash or touch the database.

/**
 * Short code for an entry: the last 8 characters of its ULID, lowercased.
 * That is 40 random bits, so about 5 collisions in 100,000 at 10,000 posts.
 */
export function shortCode(entryId: string): string {
	return entryId.slice(-8).toLowerCase();
}

/** Normalise a prefix so it starts and ends with "/". Default "/s/". */
export function normalizePrefix(prefix = "/s/"): string {
	const trimmed = prefix.replace(/^\/+|\/+$/g, "");
	return trimmed ? `/${trimmed}/` : "/";
}

/** Site-relative short path for an entry, e.g. "/s/4kqx8z2m". */
export function shortPath(entryId: string, prefix?: string): string {
	return normalizePrefix(prefix) + shortCode(entryId);
}
