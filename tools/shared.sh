#!/bin/bash
# Shared helpers for tools/*.sh. Sourced, never executed.

if [ -t 1 ] && [ -z "${NO_COLOR:-}" ]; then
	GREEN='\033[0;32m'
	YELLOW='\033[0;33m'
	RED='\033[0;31m'
	NC='\033[0m'
else
	GREEN='' YELLOW='' RED='' NC=''
fi

ok()   { printf "${GREEN}✓${NC} %s\n" "$1"; }
skip() { printf "${YELLOW}⏭${NC} %s\n" "$1"; }
fail() { printf "${RED}✗${NC} %s\n" "$1"; }
info() { printf "\n==> %s\n" "$1"; }
