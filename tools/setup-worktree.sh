#!/bin/bash
#
# Set up a linked git worktree by running the normal dev setup.
set -euo pipefail
cd "$(dirname "$0")/.."
source ./tools/shared.sh

info "Setting up git worktree..."
./tools/setup-dev.sh

ok "Worktree setup complete"
