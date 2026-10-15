#!/bin/bash
#
# Full dev setup: toolchain check, then dependency install.
set -euo pipefail
cd "$(dirname "$0")/.."
source ./tools/shared.sh

./tools/check-deps.sh
yarn install

ok "Dev environment setup complete"
