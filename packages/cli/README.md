# @tallyrelease/cli

tallyrelease computes the affected build units of a monorepo or single repo from git history and a dependency graph supplied by ecosystem plugins (`node` and `php` are built in). In 0.1 it ships `affected`, `graph` and `check`; release-please still owns versions.

## Install

```sh
npm i -D @tallyrelease/cli
# or run without installing
npx @tallyrelease/cli affected
```

Requires Node >=24.

## Configuration

Create `tallyrelease.yaml` at the repository root:

```yaml
# yaml-language-server: $schema=./node_modules/@tallyrelease/cli/dist/tallyrelease.schema.json
plugins:
  node: {}
units:
  packages/api:
    release: true
```

Units are build-only unless opted in with `release: true` (per unit) or `defaults.release: true`.

## Commands

Global flags: `--cwd <dir>` (repository root), `--config <file>` (default `tallyrelease.yaml`), `--token <token>` (forge token, default `GITHUB_TOKEN`), `--verbose`.

- `tallyrelease check` validates config, plugins, units and graph.
- `tallyrelease graph [--format text|json|mermaid] [--json]` prints units and edges.
- `tallyrelease affected [--base <ref>] [--format text|json|tsv] [--json] [--out <file>] [--github-output]` computes the build set. `--out` writes the affected document as JSON, `--github-output` appends outputs to `$GITHUB_OUTPUT`.

Exit codes: `0` ok, `1` error, `2` usage. For scripts use `--format tsv` or `--json`; the text layout may change between versions.

## Build base

- Locally, `affected` diffs against the merge base with the default branch (`origin/HEAD`, else `main` or `master`).
- On GitHub Actions it uses the event and the forge; set `GITHUB_TOKEN` so it can look up the last successful run.
- On other CI everything is built unless `--base` is given.

## GitHub Actions

```yaml
steps:
  - uses: actions/checkout@v4
    with:
      fetch-depth: 0
  - run: npx @tallyrelease/cli affected --github-output
    env:
      GITHUB_TOKEN: ${{ github.token }}
```

The job needs `actions: read` for the base lookup.

## Editor support

`tallyrelease.yaml` has a JSON schema for completion and validation in editors using the YAML language server. Add one of these modelines as the first line.

```yaml
# yaml-language-server: $schema=./node_modules/@tallyrelease/cli/dist/tallyrelease.schema.json
# yaml-language-server: $schema=https://cdn.jsdelivr.net/npm/@tallyrelease/cli@0/dist/tallyrelease.schema.json
```

Use the `node_modules` path when the cli is installed. Use the CDN URL when there is no Node setup; `@0` tracks the latest 0.x release, so pin a version for stability.

## Design

See the [design document](https://github.com/abinnovision/tally-release/blob/main/docs/design.md).

## Licence

Apache-2.0
