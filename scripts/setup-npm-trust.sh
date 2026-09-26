#!/usr/bin/env bash
# One-time (per package) bootstrap for npm trusted publishing (OIDC) via GitHub Actions.
# Run from the plugdash repo root: ./setup-npm-trust.sh
set -euo pipefail

REPO="plugdash/plugdash"
WORKFLOW="release.yml"

# Packages already published on npm — just need trust configured.
# EXISTING_PKGS=(autobuild callout engage heartpost readtime sharepost shortlink tocgen)
# EXISTING_PKGS=()

# Packages not on npm yet — need one manual publish first, then trust.
NEW_PKGS=(codeblock enrichkit fromghost fromsubstack socialcard)

require_npm_version() {
	local min="11.15.0"
	local cur
	cur="$(npm --version)"
	if ! printf '%s\n%s\n' "$min" "$cur" | sort -C -V; then
		echo "npm $cur is too old for 'npm trust' (need >= $min). Run: npm install -g npm@latest" >&2
		exit 1
	fi
}

trust_package() {
	local dir="$1"
	echo "==> npm trust: $dir"
	(cd "$dir" && npm trust github --file "$WORKFLOW" --repo "$REPO" --allow-publish --yes)
	sleep 2
}

require_npm_version

echo "Make sure you're logged in (npm login) with 2FA, and picked 'skip for 5 minutes' on the prompt."
read -rp "Press enter once that's done..." _

# for pkg in "${EXISTING_PKGS[@]}"; do
#	trust_package "packages/$pkg"
# done

for pkg in "${NEW_PKGS[@]}"; do
	dir="packages/$pkg"
	echo "==> First publish for $pkg (not on npm yet)"
	# build first (dist/ is gitignored) and use pnpm so workspace:* deps get rewritten
	(cd "$dir" && pnpm build && pnpm publish --access public --no-git-checks)
	trust_package "$dir"
done

echo "Done. Verify with: npm trust list"
