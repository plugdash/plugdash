# Native plugin pattern (EmDash 1.0.1)

This is the pattern every new or converted plugdash plugin follows. Copy the
templates as they are, rename, and delete the parts you don't use.

Everything here was run on a real EmDash 1.0.1 site (blog template, Astro
7.3.5, node adapter, SQLite), in `astro dev` and in a production build started
with `node dist/server/entry.mjs` from an empty directory. The working plugin is
`docs/examples/native-hooks/`. Source references point into
`node_modules/emdash/src/` of emdash 1.0.1.

## Results

| #   | Check                                                                   | Result                                                        |
| --- | ----------------------------------------------------------------------- | ------------------------------------------------------------- |
| a   | `content:afterPublish` fires on publish and can read options            | Pass, dev and prod                                            |
| b   | `content:afterSave` fires on autosave (`PUT` with `skipRevision: true`) | Pass. Full entry shape, see below                             |
| c   | `content:beforeSave` changes a `code` node in the same write            | Pass, but only with `content:write` declared                  |
| d   | Public route at `/_emdash/api/plugins/<id>/<route>`                     | Pass. Envelope `{ success, data }`                            |
| e   | Block Kit admin page in native format                                   | Pass. Config lives in `definePlugin({ admin })`               |
| f   | `type: "secret"` setting                                                | Pass. AES-GCM in `options`, needs `EMDASH_ENCRYPTION_KEY`     |
| g   | Hook `timeout: 60_000` with a 10 s sleep                                | Pass. Publish response returns in ~20 ms, hook finishes after |
| h   | `ctx.redirects.create` with `redirects:write`                           | Pass. Redirect live at once                                   |
| i   | `ctx.storage` collection with index: put, query, delete                 | Pass. Non-indexed queries throw                               |
| j   | Production build from an empty dir                                      | Pass. Options, hooks, cron, secret all work                   |
| k   | Native plugin in `sandboxed: []`                                        | Rejected at config load, as expected                          |

### Evidence

**a, j.** With `examplePlugin({ greeting: "hi-from-astro-config", collections: ["posts"], sleepMs: 10000 })`
in `astro.config.mjs`, the server logged on publish, in dev and in prod:

```
[plugin:native-example] afterPublish {
  collection: 'posts', id: '01M3W6CSGR0R2Y00YTB7P4PVQZ', status: 'published',
  greeting: 'hi-from-astro-config', hasApiKey: true
}
```

The generated plugins module imports the **named** export `createPlugin` from
the descriptor's `entrypoint` and calls it with `descriptor.options` inlined as
JSON (`astro/integration/virtual-modules.ts:302-305`). Options are therefore
plain JSON: no functions, no class instances, no `undefined` values.

Production was `pnpm build`, then the dev DB copied with `sqlite3 .backup`,
`_plugin_state` and `_plugin_indexes` rows deleted, and
`HOST=127.0.0.1 PORT=5103 node <site>/dist/server/entry.mjs` run from an empty
directory. The ping route returned the astro.config options, beforeSave added
`lineCount`, afterPublish, the 10 s sleep and the one-shot cron all logged, and
the three `_plugin_indexes` rows came back on startup.

**b.** Autosave (`PUT /_emdash/api/content/posts/<id>` with
`{ data: {...}, skipRevision: true }`) fires `content:afterSave` with the full
entry, not just the sent fields:

```
afterSave {
  collection: 'posts', isNew: false, status: 'draft',
  keys: [ 'id', 'type', 'slug', 'status', 'data', 'authorId', 'primaryBylineId',
          'createdAt', 'updatedAt', 'publishedAt', 'scheduledAt', 'liveRevisionId',
          'draftRevisionId', 'version', 'locale', 'translationGroup', 'seo',
          'bylines', 'byline', 'liveData' ],
  dataKeys: [ 'title', 'content' ]
}
```

On an update `liveData` (the published version) is added. Watch out: autosaving
a draft change on an **already published** post fires afterSave with
`status: 'published'` while `data` holds the unpublished draft. A
`if (status !== "published") return` guard in afterSave does not stop that.
Publish itself does not fire afterSave; it fires afterPublish.

**c.** Without `content:write` the hook is dropped at registration with only a
console line:

```
[hooks] Plugin "native-example" declares content:beforeSave hook without content:write capability - skipping
```

(the real line uses a long dash; `plugins/hooks.ts:325-360`, `HOOK_REQUIRED_CAPABILITY`). With it, a create
returns `"code":"a\nb\nc","lineCount":3` at `version: 1`, and an autosave
returns `lineCount: 4` in the same response. In beforeSave, `event.content` is
the **data object being saved** (`event.content.content`, `event.content.title`),
not the entry (`emdash-runtime.ts:3398-3412` create, `3601-3616` update). On an
update it holds only the fields that were sent. Return a new object to replace
it, return `undefined` to keep it. A throw aborts the save (`errorPolicy`
defaults to `"abort"`).

**d.** `GET` and `POST /_emdash/api/plugins/native-example/ping`:

```json
{ "success": true, "data": { "greeting": "hi-from-astro-config", "collections": ["posts"] } }
```

The handler's return value goes under `data`. Routes without `public: true`
need an admin session (cookie plus `X-EmDash-Request: 1`).

**e.** `POST /_emdash/api/plugins/native-example/admin` with
`{"type":"page_load","page":"/"}` returned the blocks under `data.blocks`; a
`{"type":"block_action","action_id":"ping","page":"/"}` returned
`data.toast: {"message":"Clicked","type":"success"}`. `/_emdash/api/manifest`
lists the plugin as `"adminMode":"blocks"` with its page. For native plugins
the manifest reads `plugin.admin.pages` / `settingsSchema` from the
`definePlugin()` result (`emdash-runtime.ts:2979-2989`); descriptor
`adminPages` are only used for standard plugins. `definePlugin()` throws if
there are admin pages or widgets but no `routes.admin`
(`plugins/define-plugin.ts:200-203`).

**f.** Settings live in the `options` table as
`plugin:<id>:settings:<key>`. A secret is stored as
`{"$emdash":"plugin-setting","v":1,"kid":"114b0ffc","iv":"...","ciphertext":...}`.
Saving one without `EMDASH_ENCRYPTION_KEY` fails:

```json
{
	"success": false,
	"error": {
		"code": "PLUGIN_SETTING_ENCRYPTION_KEY_MISSING",
		"message": "Plugin secret settings require EMDASH_ENCRYPTION_KEY"
	}
}
```

(`plugins/settings.ts:85-96`). Generate a key with
`pnpm exec emdash secrets generate` and set it in the server environment (and
as a Worker secret on Cloudflare). `ctx.settings.get("apiKey")` returns the
decrypted string (`{"set":true,"length":13}` from the example's `secret`
route). The admin settings API is
`GET|PUT /_emdash/api/admin/plugins/<id>/settings` with `{ values: {...} }`;
GET masks secrets as `secretsSet: { apiKey: true }`. Schema defaults are not
stored: `ctx.settings.get("mode")` returns `undefined` until someone saves, so
always fall back in code.

**g.** `afterPublish` with `timeout: 60_000` and a 10 s sleep: the publish
response came back in 0.02 s (afterPublish runs deferred), and
`afterPublish slept { ms: 10000 }` logged 10 s later. The default is 5000 ms
(`plugins/define-plugin.ts:281`). The timeout is a `Promise.race`; it does not
cancel the work.

**h.** `ctx.redirects.create({ source: "/go/pattern-two", destination: "/posts/pattern-two", type: 302, groupName: "native-example" })`
then `curl /go/pattern-two` gave `302 -> /posts/pattern-two`, and
`/_emdash/api/redirects` listed it with `groupName: "native-example"`.

**i.** `storage: { events: { indexes: ["collection", "createdAt", ["collection", "createdAt"]] } }`
created three rows in `_plugin_indexes`. `put`, then
`query({ where: { collection }, orderBy: { createdAt: "desc" } })` and
`count({ collection })` returned the item, then `deleteMany(ids)` brought
`count` to 0. Querying or ordering on a field that is not in `indexes` throws
`StorageQueryError: Cannot query on non-indexed field` (`plugins/storage-query.ts:113-147`).

**k.** Putting the native descriptor in `sandboxed: []` fails `astro build`
before anything runs:

```
Plugin "native-example" uses the native format and cannot be placed in `sandboxed: []`. Native plugins can only run in `plugins: []`. To sandbox this plugin, convert it to the standard format.
```

(`astro/integration/index.ts:510-516`).

## Answers for plugin cards

**Does a native plugin get `ctx.content.get` for any collection?** Yes.
With `content:read`, `ctx.content.get/list` work on every collection; there is
no per-collection scoping (`plugins/content-access.ts`). The example's
afterPublish on `posts` listed `pages` fine. Scope by your own `collections`
option.

**How do you read a collection's `urlPattern`?** Declare `schema:read`, then
`(await ctx.schema?.getCollection(collection))?.urlPattern`. It logged
`'/posts/{slug}'`. If you want the full URL of one entry,
`ctx.content.getPublicUrl(collection, id)` (needs only `content:read`) returns
`http://127.0.0.1:5102/posts/pattern-two`, or `null` if the entry is not
published, has no slug, or the collection is not routable. The origin comes
from the `emdash:site_url` option saved at setup, not from the current request
(the prod server on 5103 still returned `:5102`).

**Do `content:afterDelete` / `content:afterUnpublish` carry the status?**

- afterUnpublish: yes. `event.content` is the full entry after the change:
  `status: 'draft'`, and `publishedAt` still holds the old publish time.
- afterDelete: no. The event is `{ id, collection, permanent }`
  (`plugins/types.ts:1429`), and by the time it runs `ctx.content.get` returns
  `null` (soft delete moves it to trash). Read the status in
  `content:beforeDelete`, where `ctx.content.get` still returns the entry
  (`status: 'draft'` in the test), and stash what you need (KV keyed by id),
  then act on it in afterDelete.

## Hook capability table

Hooks are dropped silently (one `console.warn`) when the capability is missing
(`plugins/hooks.ts:325-360`):

| Hook                                                                                                                                     | Needs                           |
| ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| `content:beforeSave`                                                                                                                     | `content:write`                 |
| `content:afterSave`, `beforeDelete`, `afterDelete`, `afterPublish`, `afterUnpublish`, `afterRestore`, `afterSchedule`, `afterUnschedule` | `content:read`                  |
| `content:beforePublish`, `beforeSchedule`, `beforeUnpublish`                                                                             | `hooks.content-policy:register` |
| `media:beforeUpload` / `media:afterUpload`                                                                                               | `media:write` / `media:read`    |
| `comment:*`                                                                                                                              | `users:read`                    |
| `page:fragments`                                                                                                                         | `hooks.page-fragments:register` |
| `cron`, `plugin:*`                                                                                                                       | nothing                         |

## Rules the templates follow

- **One module, two exports.** `src/index.ts` exports the descriptor factory
  (runs in astro.config, build process) and a named `createPlugin` (runs in the
  server). EmDash imports `createPlugin` by name; a default export alone is not
  enough.
- **No globalThis.** Options reach `createPlugin(options)` directly, in dev and
  in prod. Read them there and close over them. (Block components from
  `componentsEntry` are the one exception, see AGENTS.md.)
- **Rule H, warn once.** Missing config is a warning logged once per process,
  never a throw and never a log line per save.
- **Never throw from a hook** except beforeSave when you mean to block the save.
- **Heavy or paid work goes in afterPublish** with an explicit `timeout`.
  It runs after the response, so a slow API does not slow the editor.
- **Declare every capability a hook needs**, or the hook never runs.
- `plugin:install` / `plugin:activate` do not fire for plugins registered in
  astro.config. Schedule cron lazily from a hook or route.

## Template: package.json

```json
{
	"name": "@plugdash/NAME",
	"version": "0.1.0",
	"description": "PROBLEM-FIRST ONE-LINER",
	"type": "module",
	"main": "./dist/index.mjs",
	"types": "./dist/index.d.mts",
	"exports": {
		".": {
			"types": "./dist/index.d.mts",
			"import": "./dist/index.mjs"
		}
	},
	"files": ["dist", "src"],
	"scripts": {
		"build": "tsdown src/index.ts",
		"test": "vitest run",
		"typecheck": "tsc --noEmit"
	},
	"keywords": ["emdash", "emdash-plugin", "NAME"],
	"license": "MIT",
	"peerDependencies": {
		"emdash": ">=1.0.0"
	},
	"devDependencies": {
		"@plugdash/types": "workspace:*",
		"emdash": "^1.0.1",
		"typescript": "*",
		"vitest": "*"
	}
}
```

The workspace currently resolves `emdash` 0.38.0 as an auto-installed peer.
Add `emdash ^1.0.1` as a devDependency so types and tests run against 1.0.1.

## Template: src/index.ts

```ts
import { definePlugin } from "emdash";
import type { PluginContext, PluginDescriptor } from "emdash";

const ID = "NAME";
const VERSION = "0.1.0";

// ── options ──

export interface NameOptions {
	/** Collections to act on. Empty means all. */
	collections?: string[];
}

type ResolvedOptions = Required<NameOptions>;

export function getOptions(options: NameOptions = {}): ResolvedOptions {
	return {
		collections: Array.isArray(options.collections) ? options.collections : [],
	};
}

// ── warn once (rule H) ──

const warned = new Set<string>();

function warnOnce(ctx: PluginContext, key: string, message: string): void {
	if (warned.has(key)) return;
	warned.add(key);
	ctx.log.warn(message); // ctx.log already prefixes [plugin:<id>]
}

// ── descriptor factory, used in astro.config.mjs ──

export function namePlugin(options: NameOptions = {}): PluginDescriptor<NameOptions> {
	return {
		id: ID,
		version: VERSION,
		format: "native",
		entrypoint: "@plugdash/NAME",
		options,
	};
}

// ── runtime plugin, EmDash calls this by name with the options above ──

export function createPlugin(rawOptions: NameOptions = {}) {
	const options = getOptions(rawOptions);
	const wants = (collection: string) =>
		options.collections.length === 0 || options.collections.includes(collection);

	return definePlugin({
		id: ID,
		version: VERSION,
		capabilities: ["content:read", "content:write", "schema:read", "redirects:write"],
		storage: {
			events: { indexes: ["collection", "createdAt", ["collection", "createdAt"]] },
		},
		admin: {
			pages: [{ path: "/", label: "NAME", icon: "gear" }],
			settingsSchema: {
				apiKey: { type: "secret", label: "API key" },
			},
		},
		hooks: {
			"content:beforeSave": async (event, ctx) => {
				// event.content is the data being saved, not the entry
				try {
					if (!wants(event.collection)) return;
					const blocks = event.content.content;
					if (!Array.isArray(blocks)) return;
					return { ...event.content, content: blocks /* changed */ };
				} catch (err) {
					ctx.log.error("beforeSave failed", { err: String(err) });
				}
			},

			"content:afterPublish": {
				timeout: 60_000,
				handler: async (event, ctx) => {
					try {
						if (!wants(event.collection)) return;
						const id = String(event.content.id);

						const apiKey = await ctx.settings.get<string>("apiKey");
						if (!apiKey) {
							warnOnce(ctx, "apiKey", "no API key set, skipping");
							return;
						}

						const schema = await ctx.schema?.getCollection(event.collection);
						const urlPattern = schema?.urlPattern ?? null;

						await ctx.storage.events!.put(`${id}:${Date.now()}`, {
							collection: event.collection,
							entryId: id,
							createdAt: new Date().toISOString(),
						});

						const slug = String(event.content.slug ?? id);
						const source = `/go/${slug}`;
						const existing = await ctx.redirects?.list({ search: source, limit: 1 });
						if (!existing?.items.some((r) => r.source === source)) {
							await ctx.redirects?.create?.({
								source,
								destination: `/posts/${slug}`,
								type: 302,
								groupName: ID,
							});
						}

						// one-shot: ISO date. Recurring: cron expression in UTC.
						await ctx.cron?.schedule("followup", {
							schedule: new Date(Date.now() + 60_000).toISOString(),
							data: { id, urlPattern },
						});
					} catch (err) {
						ctx.log.error("afterPublish failed", { err: String(err) });
					}
				},
			},

			cron: async (event, ctx) => {
				// event: { name, data, scheduledAt }
				ctx.log.info("cron", { name: event.name });
			},
		},
		routes: {
			// GET or POST /_emdash/api/plugins/NAME/ping -> { success, data }
			ping: {
				public: true,
				handler: async () => ({ collections: options.collections }),
			},

			// Block Kit admin page. Required when admin.pages is set.
			admin: {
				handler: async (ctx) => {
					const count = await ctx.storage.events!.count();
					return {
						blocks: [
							{ type: "header", text: "NAME" },
							{ type: "section", text: `Events: ${count}` },
						],
					};
				},
			},
		},
	});
}
```

Delete what the plugin does not use, and drop the matching capability with it.
Keep `hooks: {}` even when there are none.

## Template: astro.config.mjs

```js
import { namePlugin } from "@plugdash/NAME";

emdash({
	plugins: [namePlugin({ collections: ["posts"] })],
});
```

Native plugins go in `plugins: []`, never `sandboxed: []`.

## Template: vitest

```ts
import { describe, expect, it, vi } from "vitest";
import { createPlugin, getOptions, namePlugin } from "../src/index";

const ctx = () => ({
	log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
	settings: { get: vi.fn(async () => undefined) },
});

describe("NAME", () => {
	it("descriptor is native and carries options", () => {
		expect(namePlugin({ collections: ["posts"] })).toMatchObject({
			format: "native",
			entrypoint: "@plugdash/NAME",
			options: { collections: ["posts"] },
		});
	});

	it("getOptions fills defaults", () => {
		expect(getOptions()).toEqual({ collections: [] });
	});

	it("declares content:write so beforeSave registers", () => {
		expect(createPlugin().capabilities).toContain("content:write");
	});

	it("afterPublish has a 60s timeout", () => {
		expect(createPlugin().hooks["content:afterPublish"]?.timeout).toBe(60_000);
	});

	it("afterPublish warns once with no API key", async () => {
		const hook = createPlugin().hooks["content:afterPublish"]!;
		const c = ctx();
		const event = { collection: "posts", content: { id: "1" } };
		await hook.handler(event as never, c as never);
		await hook.handler(event as never, c as never);
		expect(c.log.warn).toHaveBeenCalledTimes(1);
	});
});
```

This runs against real `definePlugin` from emdash 1.0.1, which normalizes hooks
to `{ handler, timeout, priority, ... }`. The example in `docs/examples/` mocks
`emdash` instead, only because `docs/` is outside the pnpm workspace.

## 1.0.1 differences from older notes

- `content:beforeSave` needs `content:write`, and missing capabilities skip
  hooks silently (`plugins/hooks.ts:325-360`).
- beforeSave `event.content` is the data object, not the entry
  (`emdash-runtime.ts:3398-3412`).
- Native admin pages and settings go in `definePlugin({ admin })`, not on the
  descriptor (`emdash-runtime.ts:2979-2989`).
- Options reach `createPlugin` directly in dev and prod, so the globalThis
  bootstrap and KV seeding are not needed for native plugins.
- `ctx.cron` exists without a capability (`plugins/types.ts:1108`).
- The workspace's emdash is 0.38.0; plugin packages must pin 1.0.1 as a
  devDependency to test against current types.
