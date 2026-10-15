# Update from Upstream Template

Analyze the template delta since the last update and selectively integrate improvements into this consumer project. Instead of a git merge, each template change is evaluated individually and applied surgically — supporting renamed apps, multiple frontends, and structural deviations from the template.

## Guardrails

- Git status MUST be clean (no uncommitted changes). Refuse to proceed otherwise.
- MUST NOT be on `main`. Create a separate branch before making changes.
- Never force-push or auto-merge to main.
- Ask the user for confirmation before applying changes.
- Run full verification after applying changes.

## Steps

### 1. Determine the baseline

Read `.template-version` for the SHA of the last integrated template version. If missing, ask the user which template version they started from.

### 2. Fetch the template

```bash
git remote add template https://github.com/abinnovision/service-template.git 2>/dev/null || true
git fetch template
```

### 3. Create update branch

```bash
git checkout -b build/template-update-$(git rev-parse --short template/main)
```

### 4. Analyze the template delta

Get the full diff between the baseline SHA and the current template head:

```bash
git diff <baseline-sha> template/main --stat
git diff <baseline-sha> template/main
```

Also review the template commit log for context on why changes were made:

```bash
git log <baseline-sha>..template/main --oneline
```

### 5. Map the consumer project structure

Before applying anything, understand how the consumer project differs from the template:

- **Renamed apps**: scan `apps/` for directories and their `package.json` names. Map template paths to consumer equivalents (e.g. template's `apps/web` may be `apps/dashboard` in the consumer).
- **Additional apps**: identify apps the consumer added that don't exist in the template. Template changes to `apps/web` may need to be applied to multiple frontend apps.
- **Additional packages**: identify packages the consumer added beyond what the template provides.
- **Deleted template files**: files the consumer intentionally removed should not be re-created.

### 6. Categorize and present changes

Group the template changes into categories and present them to the user as a structured proposal before applying anything:

**Auto-apply** (apply unless the user objects):
- Root config updates (`.github/`, root `package.json` scripts, `turbo.json`, `Makefile`, `docker-compose.yml`)
- Shared package updates (`packages/tsconfig`, `packages/commons` tooling)
- Dependency version bumps in `devDependencies`
- ESLint, Prettier, Husky, commitlint config changes
- Dockerfile improvements
- CI/CD workflow updates

**Apply with mapping** (need structural awareness):
- Changes to `apps/web` → apply to all consumer frontend apps
- Changes to `apps/backend` → apply to all consumer backend apps
- Changes to app-level configs (tsconfig, vitest, vite) → map to equivalent consumer apps

**Ask the user** (require explicit decision):
- New files the template added that don't exist in the consumer
- Files the consumer deleted that the template still modifies
- Changes that conflict with consumer-specific customizations
- Structural changes (new directories, moved files, renamed exports)

### 7. Apply changes

For each approved change:

1. **Read the template's new version** of the file (from `template/main`):
   ```bash
   git show template/main:<path>
   ```
2. **Read the consumer's current version** of the equivalent file.
3. **Apply the relevant delta** — don't blindly overwrite. Integrate the template's improvement while preserving consumer-specific additions. For mapped files (renamed apps, multiple frontends), adapt paths and package names accordingly.
4. For new files: create them at the appropriate location in the consumer's structure.

### 8. Verify

```bash
yarn install && yarn turbo build && yarn check
```

If verification fails, fix issues before proceeding.

### 9. Finalize

1. Update `.template-version` with the new template SHA:
   ```bash
   git rev-parse template/main > .template-version
   ```
2. Commit: `build: update from service-template <short-sha>`
3. Suggest the user opens a PR for review.

## Change evaluation guidelines

The template does not own any files in the consumer project. Every file belongs to the consumer. The template merely offers improvements that the consumer can accept or reject.

### Accept the template's change when it:

- Upgrades dependency versions (security patches, major framework updates)
- Improves build tooling (faster builds, better caching, new turbo tasks)
- Fixes CI/CD patterns (workflow improvements, new safety checks)
- Adds new shared tooling (eslint rules, prettier updates, new scripts)
- Improves Docker build efficiency (smaller images, better caching)
- Introduces new best practices the consumer would benefit from

### Preserve the consumer's version when it:

- Intentionally deviates from the template (different auth strategy, different ORM config)
- Adds project-specific logic not present in the template
- Has customized values (ports, database names, environment variables)
- Removed something from the template on purpose

### For `package.json` files:

Take the template's `scripts`, `devDependencies`, and tooling config updates. Preserve the consumer's `dependencies` and any custom scripts they added.

### For config files (eslint, tsconfig, vitest):

Prefer the template's version unless the consumer has project-specific overrides with a clear reason.

### When in doubt, ask the user.

Show both versions, explain what the template changed and why, and let them decide.

## Summary

After all changes are applied, provide a structured summary:

- **Applied**: what was integrated and why
- **Mapped**: what was applied to renamed/additional apps and how
- **Skipped**: what was intentionally not applied and why
- **User decisions**: what the user was asked about and what they chose

This gives a clear audit trail when reviewing the PR.
