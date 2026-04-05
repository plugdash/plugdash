import { definePlugin } from "emdash";
import type { PluginContext, ContentHookEvent } from "emdash";
import { isRecord } from "@plugdash/types";

// ── Pure functions (exported for testing) ──

export async function generateFingerprint(
	ip: string,
	userAgent: string,
): Promise<string> {
	const data = new TextEncoder().encode(ip + userAgent);
	const hash = await crypto.subtle.digest("SHA-256", data);
	const bytes = new Uint8Array(hash);
	let hex = "";
	for (const b of bytes) {
		hex += b.toString(16).padStart(2, "0");
	}
	return hex.slice(0, 16);
}

function getIp(request: Request): string {
	return (
		request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
		request.headers.get("x-real-ip") ||
		""
	);
}

async function getConfig(ctx: PluginContext) {
	const collections = await ctx.kv.get<string[]>("config:collections");
	const label = (await ctx.kv.get<string>("config:label")) ?? "hearts";
	return { collections, label };
}

// ── Plugin definition ──

export default definePlugin({
	hooks: {
		"plugin:install": {
			handler: async (_event: unknown, ctx: PluginContext) => {
				await ctx.kv.set("config:label", "hearts");
				await ctx.kv.set("config:collections", null);
			},
		},

		"content:afterSave": {
			handler: async (event: ContentHookEvent, ctx: PluginContext) => {
				try {
					if (event.content.status !== "published") return;

					const { collections } = await getConfig(ctx);
					if (collections && !collections.includes(event.collection)) return;

					const id = event.content.id as string;
					const existingCount = await ctx.kv.get<number>(
						`heartpost:${id}:count`,
					);

					// Only initialise if count doesn't exist yet
					if (existingCount === null) {
						await ctx.kv.set(`heartpost:${id}:count`, 0);
					}
				} catch (err) {
					ctx.log.error("heartpost: content:afterSave failed", { err });
				}
			},
		},
	},

	routes: {
		heart: {
			public: true,
			handler: async (
				routeCtx: { input: unknown; request: Request },
				ctx: PluginContext,
			) => {
				const input = isRecord(routeCtx.input) ? routeCtx.input : {};
				const id = input.id as string | undefined;

				if (!id) {
					return { error: "missing_id" };
				}

				const ip = getIp(routeCtx.request);
				const ua = routeCtx.request.headers.get("user-agent") || "";
				const fp = await generateFingerprint(ip, ua);

				// Check if already hearted
				const existing = await ctx.kv.get<string>(
					`heartpost:${id}:${fp}`,
				);
				if (existing) {
					const count =
						(await ctx.kv.get<number>(`heartpost:${id}:count`)) ?? 0;
					return { count, hearted: true };
				}

				// Increment count (get + set)
				const currentCount =
					(await ctx.kv.get<number>(`heartpost:${id}:count`)) ?? 0;
				const newCount = currentCount + 1;
				await ctx.kv.set(`heartpost:${id}:count`, newCount);

				// Store fingerprint (fire-and-forget)
				ctx.kv
					.set(`heartpost:${id}:${fp}`, "1")
					.catch((err) =>
						ctx.log.error("heartpost: fp write failed", { err }),
					);

				return { count: newCount, hearted: true };
			},
		},

		"heart-status": {
			public: true,
			handler: async (
				routeCtx: { input: unknown; request: Request },
				ctx: PluginContext,
			) => {
				const url = new URL(routeCtx.request.url);
				const id = url.searchParams.get("id");

				if (!id) {
					return { error: "missing_id" };
				}

				const ip = getIp(routeCtx.request);
				const ua = routeCtx.request.headers.get("user-agent") || "";
				const fp = await generateFingerprint(ip, ua);

				const count =
					(await ctx.kv.get<number>(`heartpost:${id}:count`)) ?? 0;
				const fpExists = await ctx.kv.get<string>(
					`heartpost:${id}:${fp}`,
				);

				return { count, hearted: fpExists !== null };
			},
		},
	},
});
