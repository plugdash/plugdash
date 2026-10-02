// @plugdash/sharepost/utils - pure share URL generation, no runtime deps.

export type Platform = "twitter" | "linkedin" | "whatsapp" | "bluesky" | "email";

export interface ShareUrlArgs {
	title: string;
	url: string;
	via?: string;
	hashtags?: string[];
}

export function generateShareUrl(platform: Platform, args: ShareUrlArgs): string {
	const { url, via, hashtags } = args;
	// Twitter truncates title to 200 chars
	const title =
		platform === "twitter" && args.title.length > 200
			? args.title.slice(0, 200) + "..."
			: args.title;

	switch (platform) {
		case "twitter": {
			const params = new URLSearchParams();
			params.set("text", title);
			params.set("url", url);
			if (via) params.set("via", via);
			if (hashtags && hashtags.length > 0) params.set("hashtags", hashtags.join(","));
			return `https://twitter.com/intent/tweet?${params.toString()}`;
		}
		case "linkedin":
			return `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`;
		case "whatsapp":
			return `https://api.whatsapp.com/send?text=${encodeURIComponent(title + " " + url)}`;
		case "bluesky":
			return `https://bsky.app/intent/compose?text=${encodeURIComponent(title + " " + url)}`;
		case "email":
			return `mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(title + "\n\n" + url)}`;
	}
}

export interface AllShareUrlArgs {
	title: string;
	url: string;
	platforms: Platform[];
	via?: string;
	hashtags?: string[];
}

export function generateAllShareUrls(args: AllShareUrlArgs): Record<string, string> {
	const result: Record<string, string> = {};
	for (const platform of args.platforms) {
		result[platform] = generateShareUrl(platform, {
			title: args.title,
			url: args.url,
			via: args.via,
			hashtags: args.hashtags,
		});
	}
	return result;
}

/** Absolute post URL: explicit url, else the current page against `site` (or the request origin). */
export function resolveShareUrl(
	url: string | undefined,
	pathname: string,
	site: URL | string | undefined,
	origin: string,
): string {
	return url ?? new URL(pathname, site ?? origin).href;
}
