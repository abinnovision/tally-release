#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
source ./tools/shared.sh

# Install the pinned toolchain when asdf is present (no-op if already installed).
# Guarded and best effort, so setups without asdf fall through to the check below.
if command -v asdf > /dev/null 2>&1; then
	info "Installing toolchain via asdf..."
	# Only nodejs is pinned; bare `asdf install` would also pull global tools.
	if asdf install nodejs; then
		ok "asdf install complete"
	else
		skip "asdf install skipped"
	fi
	# Yarn is corepack-managed rather than pinned, so enable it and reshim to expose it.
	if corepack enable > /dev/null 2>&1; then
		ok "corepack enabled"
		asdf reshim nodejs > /dev/null 2>&1 || true
	else
		skip "corepack enable skipped"
	fi
fi

info "Checking dependencies..."

if [ "$(uname -s)" = "Darwin" ]; then
	HINT_NODE="brew install node"
	HINT_YARN="brew install yarn"
else
	HINT_NODE="install nodejs with your package manager (dnf/apt/pacman)"
	HINT_YARN="enable corepack ('corepack enable')"
fi

missing=0
for tool in node yarn; do
	if command -v "$tool" > /dev/null 2>&1; then
		ok "$tool found"
	else
		case "$tool" in
			node) fail "$tool not found, $HINT_NODE" ;;
			yarn) fail "$tool not found, $HINT_YARN" ;;
		esac
		missing=1
	fi
done

if [ "$missing" -eq 1 ]; then exit 1; fi
