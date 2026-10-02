#!/usr/bin/env bash
# Builds a real EmDash blog site in .real-emdash/site with every @plugdash
# package installed from freshly packed tarballs. Safe to re-run: the site is
# cloned once, then tarballs, astro.config.mjs and pages are refreshed.
#
# Env:
#   REAL_EMDASH_SITE_BASE  copy this ready-made site instead of cloning
#                          (local speed-up, must be the same template commit)
set -euo pipefail

TEMPLATES_REPO="https://github.com/emdash-cms/templates.git"
TEMPLATES_COMMIT="1930243108073ebb41ff48533678af7635b01c37" # emdash 1.0.1, astro 7

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
WORK="$ROOT/.real-emdash"
SITE="$WORK/site"
TARBALLS="$WORK/tarballs"
mkdir -p "$WORK"

# 1. Site from the pinned blog template
if [ ! -f "$SITE/package.json" ]; then
	if [ -n "${REAL_EMDASH_SITE_BASE:-}" ]; then
		echo "real-emdash: copying site from $REAL_EMDASH_SITE_BASE"
		cp -cR "$REAL_EMDASH_SITE_BASE" "$SITE" 2>/dev/null || cp -R "$REAL_EMDASH_SITE_BASE" "$SITE"
	else
		echo "real-emdash: cloning templates@$TEMPLATES_COMMIT"
		rm -rf "$WORK/templates"
		git init -q "$WORK/templates"
		git -C "$WORK/templates" fetch -q --depth 1 "$TEMPLATES_REPO" "$TEMPLATES_COMMIT"
		git -C "$WORK/templates" checkout -q FETCH_HEAD
		cp -R "$WORK/templates/blog" "$SITE"
		rm -rf "$WORK/templates"
	fi
fi

# 2. Template tweaks: no packageManager pin, let fresh @plugdash tarballs in
node -e '
const fs = require("fs");
const pkgPath = process.argv[1] + "/package.json";
const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
delete pkg.packageManager;
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");

const wsPath = process.argv[1] + "/pnpm-workspace.yaml";
let ws = fs.readFileSync(wsPath, "utf8").replace(/^\s*- "@plugdash\/\*"\n/m, "");
ws = ws.replace(/^minimumReleaseAgeExclude:\n/m, "$&  - \"@plugdash/*\"\n");
fs.writeFileSync(wsPath, ws);
' "$SITE"

# 3. Build and pack every public package
cd "$ROOT"
pnpm install --frozen-lockfile
pnpm -r build
rm -rf "$TARBALLS"
mkdir -p "$TARBALLS"
for dir in "$ROOT"/packages/*/; do
	(cd "$dir" && pnpm pack --pack-destination "$TARBALLS" >/dev/null)
done

# 4. Install the tarballs into the site
cd "$SITE"
rm -rf node_modules/@plugdash
pnpm add "$TARBALLS"/*.tgz

# 5. astro.config.mjs (every plugin, no options) and the post page
node "$ROOT/scripts/real-emdash/write-site.mjs" "$ROOT" "$SITE"

echo "real-emdash: site ready at $SITE"
