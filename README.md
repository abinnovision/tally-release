# tallyrelease

tallyrelease reads git history and a dependency graph supplied by ecosystem plugins to decide which units of a repository are affected by a change. A later milestone adds versioning and release effects (release PRs, tags, forge releases).

## Status

v0.1 ships the `affected`, `graph` and `check` commands, with release-please still owning versions. The versioning planner is next. See [docs/design.md](docs/design.md) for the design, milestones and decisions.

## Install

```sh
npm i -D @tallyrelease/cli
```

See [packages/cli/README.md](packages/cli/README.md) for full usage.

## Packages

| Package              | Purpose                                 |
| :------------------- | :-------------------------------------- |
| `@tallyrelease/core` | Pure planning core and plugin contract. |
| `@tallyrelease/cli`  | The `tallyrelease` binary.              |

Configuration lives in `tallyrelease.yaml`. Units are build-only unless opted in with `release: true` (per unit) or `defaults.release: true`; plugins supply the version source (`file` or `tag`).

## Usage

```text
$ tallyrelease affected
base  4f2a91c (merge base with origin/main)

direct (1)
  db          packages/db
dependent (3)
  api-server  apps/api-server  via db          released
  scripts     scripts          via api-server
  tests       tests            via api-server

4 of 10 units affected, 2 files outside any unit
```

Outside CI, `affected` diffs against the merge base with the default branch (`origin/HEAD`, else `main` or `master`), so it shows what the current branch changed. On GitHub Actions it uses the event and the forge; other CI builds everything unless `--base` is given. For scripts, use `--format tsv` or `--json`; the text layout may change between versions.

````sh
tallyrelease affected --format tsv
tallyrelease graph --format mermaid
{ echo '```mermaid'; tallyrelease graph --format mermaid; echo '```'; } >> "$GITHUB_STEP_SUMMARY"
````

## Editor support

`tallyrelease.yaml` has a JSON schema for completion and validation in editors using the YAML language server. Add one of these modelines as the first line.

```yaml
# yaml-language-server: $schema=./node_modules/@tallyrelease/cli/dist/tallyrelease.schema.json
# yaml-language-server: $schema=https://cdn.jsdelivr.net/npm/@tallyrelease/cli@0/dist/tallyrelease.schema.json
```

Use the `node_modules` path when the cli is installed, since it always matches the installed version. Use the CDN URL when there is no Node setup; `@0` tracks the latest 0.x release, so pin a version for stability.

## Development

Requires Node 24 and Yarn (via corepack).

```bash
make setup-dev
yarn check
yarn build
yarn test-unit
yarn turbo test-integration
```

## Licence

Apache-2.0, see [LICENSE](LICENSE).
