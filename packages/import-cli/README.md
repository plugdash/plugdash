# @plugdash/import

**@plugdash/import** - moving a Ghost or Substack blog into EmDash shouldn't mean copy-pasting posts one at a time. `plugdash-import` reads the export file you already have and creates the entries on your site over the EmDash REST API: body as Portable Text, images uploaded to the media library, tags, SEO fields and the original dates. You run it from your laptop, and nothing gets added to your site's server bundle.

It uses the same parsers as [`@plugdash/fromghost`](../fromghost) and [`@plugdash/fromsubstack`](../fromsubstack). You don't need to register those plugins.

## Install

```sh
pnpm add -D @plugdash/import
```

Or run it once without installing it:

```sh
pnpm dlx @plugdash/import --help
```

Node 20 or newer.

## Get an API token

1. Open your site's admin and go to **Settings > API Tokens** (`/_emdash/admin/settings/api-tokens`).
2. Create a token with these scopes: `content:read`, `content:write`, `media:read`, `media:write`, `schema:read`.
3. Copy the token. It starts with `ec_pat_` and is only shown once.

You can pass it as `--token`, or set `EMDASH_TOKEN` (and `EMDASH_URL`) so it stays out of your shell history:

```sh
export EMDASH_URL=https://example.com
export EMDASH_TOKEN=ec_pat_...
```

## Ghost

Export from Ghost admin under **Settings > Labs > Export your content**. You get a `.json` file.

```sh
# see what would happen, write nothing
plugdash-import ghost ./my-blog.ghost.json --url https://example.com --token ec_pat_... --dry-run

# import everything as drafts
plugdash-import ghost ./my-blog.ghost.json --url https://example.com --token ec_pat_... \
  --site-url https://old-blog.ghost.io
```

Ghost exports point at images as `__GHOST_URL__/content/images/...`. Pass `--site-url` with your old Ghost address so the CLI can download them. If you leave it out, posts are still imported and each missing image is listed as a warning.

Ghost posts go into `--collection` (default `posts`). Ghost pages go into `pages` if your site has that collection, and are skipped otherwise.

## Substack

Export from Substack under **Settings > Exports > Create new export**. You get a `.zip` with `posts.csv` and one HTML file per post.

```sh
plugdash-import substack ./substack-export.zip --url https://example.com --token ec_pat_... --dry-run
plugdash-import substack ./substack-export.zip --url https://example.com --token ec_pat_...
```

Images are downloaded from Substack's CDN, so they need no extra flag. Podcast episodes are skipped.

## What it does

1. Reads the export and prints how many posts, pages and tags it found, and which collection each type goes to.
2. Checks that the target collection has a `title` field and a Portable Text body field (`content`, or whatever `--field` names). A missing posts collection or field stops the run before anything is written. `--dry-run` stops here.
3. For each entry, skips it if the slug already exists in that collection.
4. Uploads each image once, then points the Portable Text image blocks and `featured_image` at the media library copy.
5. Creates the entry with its slug, title, body, excerpt, tags, SEO title and description, and the original created and published dates.
6. With `--publish`, publishes the entries that were published at the source. Source drafts always stay drafts. Without `--publish`, everything lands as a draft.
7. Prints a summary and exits with code 1 if any entry failed.

Running it twice is safe. The second run skips every entry the first one created, so a run that failed halfway can be finished by running it again.

## Options

| Option | Default | Description |
| --- | --- | --- |
| `--url <url>` | `EMDASH_URL` | The EmDash site to import into |
| `--token <token>` | `EMDASH_TOKEN` | API token (see above) |
| `--cookie <cookie>` | - | Use an admin session cookie instead of a token, handy on a local dev site |
| `--site-url <url>` | - | Ghost only: the old site, used to download `__GHOST_URL__` images |
| `--collection <slug>` | `posts` | Collection for posts |
| `--field <slug>` | `content` | Portable Text field that gets the body |
| `--dry-run` | off | Analyze and check the schema, write nothing |
| `--publish` | off | Publish entries that were published at the source |

## Limits

- Authors are not imported. Entries are owned by the token's user.
- Tags need a `tag` taxonomy on the target collection (the blog template has one). Without it, the run prints a warning and imports the posts without tags.
- An `<img>` inside a `<p>` is dropped by the HTML to Portable Text converter. Images inside `<figure>` (Ghost cards, Substack captioned images) work.
- Ghost 4 and later keeps custom SEO titles in `posts_meta`. The CLI reads it there and falls back to the fields on the post.
- Members-only and paid status are not carried over. Every imported entry is public once published.
