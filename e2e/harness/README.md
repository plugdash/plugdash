# e2e harness

Specs in `e2e/` run against a real EmDash 1.0 blog built by `scripts/real-emdash/setup.sh`: the pinned `emdash-cms/templates` blog, with every plugdash package installed from packed tarballs and registered with no options. The post page (`/posts/<slug>`) renders the companion components inside `#pd-readtime`, `#pd-toc`, `#pd-share`, `#pd-heart`, `#pd-copy` and `#pd-engage`.

```bash
pnpm e2e           # setup + every spec against astro dev
pnpm e2e:prod      # setup + @prod specs against the built server
pnpm e2e:setup     # just rebuild .real-emdash/site
pnpm exec playwright test e2e/readtime.spec.ts   # rerun one spec, no setup
```

Global setup starts the server, logs in once and stops the server at the end. You don't start anything yourself.

## env vars

| var             | default | what                                                             |
| --------------- | ------- | ---------------------------------------------------------------- |
| `E2E_PORT`      | 4321    | dev server port                                                  |
| `E2E_PROD_PORT` | 4400    | production server port                                           |
| `E2E_MODE`      |         | `prod` runs the built server and only tests tagged `@prod`       |
| `E2E_BASE_URL`  |         | reuse a server you already started (dev only, dev-bypass needed) |

## API

Import everything from `./harness`. Requests run as the dev admin.

- `createPost({ title, blocks?, slug?, data?, collection? })` creates a draft. `blocks` mixes strings (paragraphs) and Portable Text blocks. The slug is unique by default. Returns the item (`id`, `slug`, `status`, `data`).
- `block(text, style?)` builds a text block. `style` is `"normal"`, `"h2"`, `"h3"`, ...
- `publish(id)`, `unpublish(id)`, `getPost(id)`. All take an optional collection, default `"posts"`.
- `autosave(id, data)` sends the same PUT the admin editor sends while you type (`skipRevision: true`).
- `api(method, path, body?)` calls any EmDash route. Returns `{ status, body, data }` and never throws, so assert on `status`.
- `logMark()` then `pluginLog(since)` returns server log lines starting with `[plugin:` written after the mark. Some hooks finish after the response returns, so poll:

  ```ts
  const mark = logMark();
  await publish(post.id);
  await expect.poll(() => pluginLog(mark).join("\n")).toContain("[plugin:autobuild]");
  ```

- `startDev()`, `startProd()` return `{ baseURL, stop }`. Global setup already calls them; use them directly only for a spec that needs its own server.

Tag a test `@prod` in its title when it should also run against the production build. Prod gets a copy of the dev database with `plugin:%config%` option rows removed, so it starts like a fresh install that already has content. `emdash:site_url` is rewritten to the prod URL, so `ctx.site.url` matches the server you hit.

## limits

- Outbound requests to loopback are blocked by EmDash's SSRF guard, so a plugin webhook can't hit a local mock server. Assert on `pluginLog()` lines instead.
- One site and one log file, so specs run serially (`workers: 1`). Use unique titles and slugs.
- Specs that don't import `./harness` are skipped (old testbed specs). The skip goes away once each plugin card ports its spec.
