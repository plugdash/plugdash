# @plugdash/testing

Private test helpers. Mocks that accept anything hide bugs that only show up on a real site, so these mimic EmDash 1.0.1: validation errors, draft revisions, the `{ success, data }` route envelope, hook timeouts.

## makeContext(options?)

Returns a plugin context. Plain `Partial<PluginContext>` overrides still work. Extra options:

| option               | what it does                                                                                                                                                                          |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `schema`             | `{ posts: ["title", "content"] }`. `content.update()`/`create()` throw `EmDashValidationError: Unknown field 'x' in collection 'posts'` for other fields. Turns on in-memory content. |
| `revisions`          | `update()` writes a draft copy, `get()` reads live. Promote with `ctx.publishDraft(collection, id)`. Read it with `ctx.getDraft()`.                                                   |
| `items`              | Pre-loaded content: `{ posts: [{ id: "p1", slug: "a", status: "published", data: { title: "x" } }] }`.                                                                                |
| `settingsSchema`     | `{ token: { type: "secret" } }`. Secret settings only accept strings.                                                                                                                 |
| `options`            | Native descriptor options, exposed as `ctx.options`.                                                                                                                                  |
| `allowedHosts`       | Turns on `ctx.http`. Hosts outside the list reject with EmDash's error text. `[]` rejects everything.                                                                                 |
| `fetch`              | What `ctx.http.fetch` returns once the host check passes. Default: 200 `{}`.                                                                                                          |
| `storageCollections` | `["clicks"]` adds in-memory `ctx.storage.clicks` with `put/get/query/delete/count/getMany/putMany/...`.                                                                               |

Always present: `ctx.kv` (`get/set/delete/list(prefix)/getVersioned/compareAndSet/compareAndDelete`, in memory, `null` for missing keys, `settings:` keys alias `ctx.settings` like EmDash), `ctx.settings` (same API, `get()` returns `null` when unset, the schema default is not applied), `ctx.redirects` (`create/get/list/update/delete`, writes need the `_rev` from the previous result), `ctx.logs` (every `ctx.log.*` call as `{ level, message, data }`), `ctx.fetchCalls`.

Without `schema` or `revisions`, `ctx.content` is still the loose `vi.fn` mock from before, so existing tests keep passing.

## runHook(plugin, hookName, event, ctx)

Calls `handler(event, ctx)` for a bare function or a `{ handler, timeout }` entry. Rejects with `Hook timeout after <n>ms` after `timeout` (default 5000). The handler is not cancelled, same as EmDash.

## callRoute(plugin, routeName, { method, query, body, headers, ctx, user })

Returns what the HTTP endpoint returns: `{ success: true, data }` or `{ success: false, error: { code, message } }`. The status code is on a non-enumerable `status` property.

- Unknown route: `NOT_FOUND` "Plugin route not found" (404).
- Wrong method (when the route sets `methods`): `METHOD_NOT_ALLOWED` (405).
- `PluginRouteError` throws keep their code, message and status. Any other throw becomes `INTERNAL_ERROR` "Plugin route error" (500), so the real message never leaks.
- Bare-object (standard) plugins get `(routeCtx, ctx)` with a plain-object `request`; plugins with a string `id` (native) get one ctx with a real `Request`.
- Not modelled: auth on non-public routes.

## makePost({ fieldName = "content", slug, title, text, data })

A post shaped like `getEmDashEntry()`: `id` is the slug, `data.id` is the ULID, Portable Text in `data[fieldName]`.
