# Each target below runs tools/<target>.sh. Ordering and flags live in the scripts, so
# this file holds no logic.
.PHONY: install install-immutable check-deps setup-dev setup-worktree

install:
	yarn install

# CI installation with lockfile validation
install-immutable:
	yarn install --immutable

check-deps setup-dev setup-worktree:
	@./tools/$@.sh
