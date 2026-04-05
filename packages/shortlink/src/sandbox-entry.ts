import { definePlugin } from "emdash";
import type { PluginContext, ContentHookEvent } from "emdash";
import { isRecord } from "@plugdash/types";

// ── Pure functions (exported for testing) ──

const CHARSET = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

export function generateCode(length: number): string {
	let code = "";
	for (let i = 0; i < length; i++) {
		code += CHARSET[Math.floor(Math.random() * CHARSET.length)];
	}
	return code;
}

function isAlphanumeric(str: string): boolean {
	return /^[a-zA-Z0-9]+$/.test(str);
}

// ── Config from KV ──

interface ShortlinkConfig {
	prefix: string;
	codeLength: number;
	autoCreate: boolean;
	domain: string | null;
}

async function getConfig(ctx: PluginContext): Promise<ShortlinkConfig> {
	const prefix = (await ctx.kv.get<string>("config:prefix")) ?? "/s/";
	const codeLength = (await ctx.kv.get<number>("config:codeLength")) ?? 4;
	const autoCreate = (await ctx.kv.get<boolean>("config:autoCreate")) ?? true;
	const domain = (await ctx.kv.get<string>("config:domain")) ?? null;
	return { prefix, codeLength, autoCreate, domain };
}

// ── KV data types ──

interface ShortlinkData {
	code: string;
	target: string;
	contentId?: string;
	collection?: string;
	createdAt: string;
	expiresAt?: string;
	custom: boolean;
}

// ── Code generation with collision retry ──

const MAX_RETRIES = 5;

async function generateUniqueCode(
	ctx: PluginContext,
	length: number,
): Promise<string> {
	for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
		const code = generateCode(length);
		const existing = await ctx.kv.get(`shortlink:${code}`);
		if (existing === null) return code;
	}
	// All retries collided - increase length by 1 and try once more
	const code = generateCode(length + 1);
	return code;
}

// ── Admin page rendering ──

async function renderAdminPage(ctx: PluginContext) {
	const config = await getConfig(ctx);
	const allLinks = await ctx.kv.list("shortlink:");

	// Filter to only shortlink data entries (not by-content or config keys)
	const shortlinks = allLinks
		.filter(
			(entry) =>
				!entry.key.startsWith("shortlink:by-content:") &&
				isRecord(entry.value) &&
				typeof (entry.value as Record<string, unknown>).code === "string",
		)
		.map((entry) => entry.value as unknown as ShortlinkData);

	return {
		blocks: [
			{
				type: "header",
				text: "Short Links",
			},
			{
				type: "stats",
				items: [
					{
						label: "Total Links",
						value: String(shortlinks.length),
					},
				],
			},
			{
				type: "divider",
			},
			{
				type: "form",
				block_id: "settings",
				fields: [
					{
						type: "text_input",
						action_id: "prefix",
						label: "Route prefix",
						initial_value: config.prefix,
					},
					{
						type: "number_input",
						action_id: "codeLength",
						label: "Code length",
						initial_value: config.codeLength,
						min: 2,
						max: 12,
					},
					{
						type: "toggle",
						action_id: "autoCreate",
						label: "Auto-create on publish",
						initial_value: config.autoCreate,
					},
					{
						type: "text_input",
						action_id: "domain",
						label: "Custom domain (optional)",
						initial_value: config.domain ?? "",
						placeholder: "https://yourdomain.com",
					},
				],
				submit: { label: "Save Settings", action_id: "save_settings" },
			},
			{
				type: "divider",
			},
			{
				type: "table",
				columns: [
					{ key: "code", label: "Code" },
					{ key: "target", label: "Target" },
					{ key: "custom", label: "Custom" },
					{ key: "createdAt", label: "Created" },
					{ key: "actions", label: "" },
				],
				rows: shortlinks.map((link) => ({
					code: link.code,
					target: link.target,
					custom: link.custom ? "Yes" : "No",
					createdAt: link.createdAt,
					actions: {
						type: "button",
						text: "Delete",
						action_id: `delete_shortlink:${link.code}`,
						style: "danger",
						confirm: {
							title: "Delete shortlink?",
							text: `This will remove the shortlink "${link.code}". Existing URLs will stop working.`,
							confirm: "Delete",
							deny: "Cancel",
						},
					},
				})),
			},
			{
				type: "divider",
			},
			{
				type: "header",
				text: "Create Custom Shortlink",
			},
			{
				type: "form",
				block_id: "create",
				fields: [
					{
						type: "text_input",
						action_id: "code",
						label: "Short code",
						placeholder: "my-custom-slug",
					},
					{
						type: "text_input",
						action_id: "target",
						label: "Target URL",
						placeholder: "/posts/my-post",
					},
				],
				submit: { label: "Create Shortlink", action_id: "create_shortlink" },
			},
		],
	};
}

// ── Plugin definition ──

export default definePlugin({
	hooks: {
		"plugin:install": {
			handler: async (_event: unknown, ctx: PluginContext) => {
				await ctx.kv.set("config:prefix", "/s/");
				await ctx.kv.set("config:codeLength", 4);
				await ctx.kv.set("config:autoCreate", true);
				ctx.log.info("shortlink: installed with default config");
			},
		},

		"content:afterSave": {
			handler: async (event: ContentHookEvent, ctx: PluginContext) => {
				try {
					if (event.content.status !== "published") return;

					if (!ctx.content) {
						ctx.log.error("shortlink: content capability unavailable");
						return;
					}

					const config = await getConfig(ctx);
					if (!config.autoCreate) return;

					const id = event.content.id as string;

					// Check if shortlink already exists for this content
					const existingCode = await ctx.kv.get<string>(
						`shortlink:by-content:${id}`,
					);
					if (existingCode) return;

					// Generate unique code
					const code = await generateUniqueCode(ctx, config.codeLength);

					// Build target URL from slug
					const slug = event.content.slug as string | null;
					const target = slug
						? `/${event.collection}/${slug}`
						: `/${event.collection}/${id}`;

					// Build short URL
					const url = `${config.prefix}${code}`;
					const baseUrl = config.domain ?? ctx.site.url;
					const fullUrl = `${baseUrl}${url}`;

					// Store shortlink data
					const linkData: ShortlinkData = {
						code,
						target,
						contentId: id,
						collection: event.collection,
						createdAt: new Date().toISOString(),
						custom: false,
					};
					await ctx.kv.set(`shortlink:${code}`, linkData);
					await ctx.kv.set(`shortlink:by-content:${id}`, code);

					// Read-merge-write metadata
					const existing = await ctx.content.get(event.collection, id);
					const existingData = isRecord(existing?.data)
						? existing!.data
						: {};
					const existingMeta = isRecord(existingData.metadata)
						? (existingData.metadata as Record<string, unknown>)
						: {};

					await ctx.content.update!(event.collection, id, {
						metadata: {
							...existingMeta,
							shortlink: { code, url, fullUrl },
						},
					});

					ctx.log.info("shortlink: created", { id, code, url });
				} catch (err) {
					ctx.log.error("shortlink: failed to create shortlink", { err });
				}
			},
		},
	},

	routes: {
		resolve: {
			public: true,
			handler: async (
				routeCtx: { input: unknown; request: Request },
				ctx: PluginContext,
			) => {
				const url = new URL(routeCtx.request.url);
				const code = url.searchParams.get("code");

				if (!code) {
					return { error: "missing_code" };
				}

				const data = await ctx.kv.get<ShortlinkData>(`shortlink:${code}`);
				if (!data) {
					return { error: "not_found" };
				}

				// Check expiry
				if (data.expiresAt && new Date(data.expiresAt) < new Date()) {
					return { expired: true, code: data.code };
				}

				return {
					target: data.target,
					code: data.code,
				};
			},
		},

		admin: {
			handler: async (
				routeCtx: { input: unknown; request: Request },
				ctx: PluginContext,
			) => {
				const interaction = routeCtx.input as Record<string, unknown>;

				// Page load - render the admin page
				if (
					!interaction ||
					(interaction.type === "page_load")
				) {
					return renderAdminPage(ctx);
				}

				// Save settings
				if (
					interaction.type === "form_submit" &&
					interaction.action_id === "save_settings"
				) {
					const values = interaction.values as Record<string, unknown>;
					if (values.prefix) await ctx.kv.set("config:prefix", values.prefix);
					if (values.codeLength)
						await ctx.kv.set("config:codeLength", Number(values.codeLength));
					if (typeof values.autoCreate === "boolean")
						await ctx.kv.set("config:autoCreate", values.autoCreate);
					await ctx.kv.set(
						"config:domain",
						values.domain && String(values.domain).length > 0
							? String(values.domain)
							: null,
					);

					const page = await renderAdminPage(ctx);
					return {
						...page,
						toast: { message: "Settings saved", type: "success" },
					};
				}

				// Create custom shortlink
				if (
					interaction.type === "form_submit" &&
					interaction.action_id === "create_shortlink"
				) {
					const values = interaction.values as Record<string, unknown>;
					const code = String(values.code ?? "").trim();
					const target = String(values.target ?? "").trim();

					if (!code || !isAlphanumeric(code)) {
						const page = await renderAdminPage(ctx);
						return {
							...page,
							toast: {
								message: "Code must be alphanumeric only",
								type: "error",
							},
						};
					}

					if (!target) {
						const page = await renderAdminPage(ctx);
						return {
							...page,
							toast: {
								message: "Target URL is required",
								type: "error",
							},
						};
					}

					// Check for duplicate
					const existing = await ctx.kv.get(`shortlink:${code}`);
					if (existing) {
						const page = await renderAdminPage(ctx);
						return {
							...page,
							toast: {
								message: `Code "${code}" is already in use`,
								type: "error",
							},
						};
					}

					const linkData: ShortlinkData = {
						code,
						target,
						createdAt: new Date().toISOString(),
						custom: true,
					};
					await ctx.kv.set(`shortlink:${code}`, linkData);

					const page = await renderAdminPage(ctx);
					return {
						...page,
						toast: {
							message: `Shortlink "${code}" created`,
							type: "success",
						},
					};
				}

				// Delete shortlink
				if (
					interaction.type === "block_action" ||
					interaction.type === "button_click"
				) {
					const actionId = String(interaction.action_id ?? "");
					if (actionId.startsWith("delete_shortlink:")) {
						const code = actionId.replace("delete_shortlink:", "");
						const data = await ctx.kv.get<ShortlinkData>(
							`shortlink:${code}`,
						);

						await ctx.kv.delete(`shortlink:${code}`);
						// Clean up reverse index if content-linked
						if (data?.contentId) {
							await ctx.kv.delete(
								`shortlink:by-content:${data.contentId}`,
							);
						}

						const page = await renderAdminPage(ctx);
						return {
							...page,
							toast: {
								message: `Shortlink "${code}" deleted`,
								type: "success",
							},
						};
					}
				}

				return renderAdminPage(ctx);
			},
		},
	},
});
