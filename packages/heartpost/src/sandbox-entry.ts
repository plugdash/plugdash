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

// ── Admin page helpers ──

function parseCollections(input: unknown): string[] | null {
	if (typeof input !== "string") return null;
	const list = input
		.split(",")
		.map((s) => s.trim())
		.filter((s) => s.length > 0);
	return list.length > 0 ? list : null;
}

export function validateHeartpostSettings(values: Record<string, unknown>): {
	ok: boolean;
	error?: string;
	label?: string;
	collections?: string[] | null;
} {
	const labelRaw = values.label;
	if (typeof labelRaw !== "string") {
		return { ok: false, error: "Label is required" };
	}
	const label = labelRaw.trim();
	if (label.length === 0) {
		return { ok: false, error: "Label cannot be empty" };
	}
	if (label.length > 20) {
		return { ok: false, error: "Label must be 20 characters or fewer" };
	}
	const collections = parseCollections(values.collections);
	return { ok: true, label, collections };
}

async function buildSettingsPage(ctx: PluginContext) {
	const label = (await ctx.kv.get<string>("config:label")) ?? "hearts";
	const collections = await ctx.kv.get<string[] | null>("config:collections");

	return {
		blocks: [
			{ type: "header", text: "Heart Post Settings" },
			{
				type: "context",
				text: "Configure heart counts. Changes take effect on the next publish.",
			},
			{ type: "divider" },
			{
				type: "form",
				block_id: "heartpost-settings",
				fields: [
					{
						type: "text_input",
						action_id: "label",
						label: "Heart label (shown in pill/ghost variants)",
						placeholder: "hearts",
						initial_value: label,
						help_text: "The word shown after the count. e.g. 'hearts', 'likes', 'kudos'.",
					},
					{
						type: "text_input",
						action_id: "collections",
						label: "Collections (comma-separated, leave blank for all)",
						placeholder: "blog",
						initial_value: collections && collections.length > 0 ? collections.join(", ") : "",
						help_text:
							"Only these collections will have heart counts initialised on publish.",
					},
				],
				submit: { label: "Save", action_id: "save_settings" },
			},
		],
	};
}

async function handleSaveSettings(
	values: Record<string, unknown>,
	ctx: PluginContext,
) {
	const result = validateHeartpostSettings(values);
	if (!result.ok) {
		const page = await buildSettingsPage(ctx);
		return { ...page, toast: { message: result.error, type: "error" } };
	}
	await ctx.kv.set("config:label", result.label!);
	await ctx.kv.set("config:collections", result.collections ?? null);
	const page = await buildSettingsPage(ctx);
	return { ...page, toast: { message: "Settings saved", type: "success" } };
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

		"heart-remove": {
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

				// Check if currently hearted
				const existing = await ctx.kv.get<string>(
					`heartpost:${id}:${fp}`,
				);
				if (!existing) {
					const count =
						(await ctx.kv.get<number>(`heartpost:${id}:count`)) ?? 0;
					return { count, hearted: false };
				}

				// Delete fingerprint (fire-and-forget)
				ctx.kv
					.delete(`heartpost:${id}:${fp}`)
					.catch((err) =>
						ctx.log.error("heartpost: fp delete failed", { err }),
					);

				// Decrement count (min 0)
				const currentCount =
					(await ctx.kv.get<number>(`heartpost:${id}:count`)) ?? 0;
				const newCount = Math.max(0, currentCount - 1);
				await ctx.kv.set(`heartpost:${id}:count`, newCount);

				return { count: newCount, hearted: false };
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

		admin: {
			handler: async (
				routeCtx: { input: unknown; request: Request },
				ctx: PluginContext,
			) => {
				const interaction = routeCtx.input as {
					type?: string;
					action_id?: string;
					values?: Record<string, unknown>;
				};
				if (
					!interaction ||
					interaction.type === "page_load" ||
					interaction.type === undefined
				) {
					return buildSettingsPage(ctx);
				}
				if (
					interaction.type === "form_submit" &&
					interaction.action_id === "save_settings"
				) {
					return handleSaveSettings(interaction.values ?? {}, ctx);
				}
				return buildSettingsPage(ctx);
			},
		},
	},
});
