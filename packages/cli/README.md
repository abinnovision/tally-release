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

Tags label units so CI can split the build set by kind:

```yaml
units:
  apps/web: { tags: [docker] }
  packages/api: { release: true, tags: [npm] }
```

## Commands

Global flags: `--cwd <dir>` (repository root), `--config <file>` (default `tallyrelease.yaml`), `--token <token>` (forge token, default `GITHUB_TOKEN`), `--verbose`.

- `tallyrelease check` validates config, plugins, units, graph and release config; with released units it also checks the repository's tags.
- `tallyrelease graph [--format text|json|mermaid] [--json]` prints units and edges.
- `tallyrelease affected [--base <ref>] [--format text|json|tsv] [--json] [--out <file>] [--github-output] [--tag <tag>]` computes the build set. `--out` writes the affected document as JSON, `--github-output` appends outputs to `$GITHUB_OUTPUT`. `--tag` (repeatable) keeps units with any of the given tags.
- `tallyrelease plan [--branch <name>] [--base <ref>] [--head <ref>] [--all] [--format text|json] [--json] [--out <file>] [--github-output] [--summary]` computes the release plan without changing anything: kind, base version, bump, next version and prerelease version per unit. `--head` plans another commit with the current config, `--all` also lists released units with a pending release outside the build set. `--github-output` writes `plan`, the path of the written plan (`--out`, else `$RUNNER_TEMP/tallyrelease-plan.json`). `--summary` appends a markdown summary to `$GITHUB_STEP_SUMMARY`, or prints it instead of the table when unset (exit 2 with `--json` then). The JSON schema is exported as `@tallyrelease/cli/plan.schema.json`.
- `tallyrelease explain <unit> [--branch <name>] [--base <ref>]` explains a unit: why it is affected, which commits and files bump it (including changes absorbed from unreleased dependencies), propagation and Release-As footers.

- `tallyrelease shadow [--manifest <path>] [--rp-config <path>] [--head <ref>] [--branch <name>] [--pin <spec>] [--out <file>] [--summary] [--strict]` compares tallyrelease with a release-please release: on a push that changes the release-please manifest, it plans the parent commit and compares each unit's next version with the new manifest value. See [Shadow mode](#shadow-mode).

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

The `affected` output is a JSON array of `{id, path, plugin, reason, released, tags}` and works as a matrix:

```yaml
jobs:
  affected:
    runs-on: ubuntu-latest
    outputs:
      docker: ${{ steps.docker.outputs.affected }}
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - id: docker
        run: npx @tallyrelease/cli affected --tag docker --github-output
        env:
          GITHUB_TOKEN: ${{ github.token }}
  image:
    needs: affected
    if: needs.affected.outputs.docker != '[]'
    strategy:
      matrix:
        unit: ${{ fromJSON(needs.affected.outputs.docker) }}
    runs-on: ubuntu-latest
    steps:
      - run: echo "build ${{ matrix.unit.id }} from ${{ matrix.unit.path }}"
```

## Releases in CI

`tallyrelease run [--branch <name>] [--dry-run] [--base <ref>] [--out <file>] [--github-output] [--summary]` is the CI entry point: it reconciles merged release PRs (tags, GitHub releases, labels), plans HEAD, updates the release PRs and writes the plan. `release` and `pr` run the first and last step alone.

With `--github-output`, `run` writes two outputs to `$GITHUB_OUTPUT`:

- `plan`: the path of the plan document (`--out`, else `$RUNNER_TEMP/tallyrelease-plan.json`).
- `releases`: a compact JSON array of everything to publish. Stable releases come first, oldest release commit first, then in plan unit order. Prereleases follow in plan unit order, and a unit with a release at HEAD has none. Every stable tag in the range is listed, also several of one unit, so nothing tagged stays unpublished; a failed run lists its releases again on the next run.

| Field        | Meaning                                                                                                                                                                                             |
| :----------- | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`, `path` | Unit id and root.                                                                                                                                                                                   |
| `kind`       | `release` or `prerelease`.                                                                                                                                                                          |
| `version`    | Released version, or the prerelease version of the plan.                                                                                                                                            |
| `channel`    | Channel of the line for a prerelease, `null` for a release.                                                                                                                                         |
| `tag`        | Version tag of a release, `null` for a prerelease.                                                                                                                                                  |
| `tagPrefix`  | Literal part of the tag format before `{version}` (`{id}` rendered), `null` for a prerelease and for a tag format with text after `{version}`; publishers cannot apply the git rule to such a unit. |
| `sha`        | Full sha the entry is built from (equals `releaseSha`).                                                                                                                                             |
| `releaseSha` | Full sha of the tagged release commit, or HEAD for a prerelease.                                                                                                                                    |
| `catchUp`    | `true` for a release whose commit is not HEAD.                                                                                                                                                      |
| `pr`         | Number of the release PR, else `null`.                                                                                                                                                              |
| `line`       | `default` or `maintenance`.                                                                                                                                                                         |

The entry schema is `releaseEntrySchema` in `src/plan-schema.ts`.

### Permissions and tokens

| Command    | Token permissions                                                          |
| :--------- | :------------------------------------------------------------------------- |
| `affected` | `contents: read`, `actions: read` (build base)                             |
| `plan`     | `contents: read`, `actions: read` (build base)                             |
| `pr`       | `contents: write`, `pull-requests: write`, `issues: read` (label listing)  |
| `release`  | `contents: write`, `pull-requests: write`, `issues: read`, `actions: read` |
| `run`      | the union of the above                                                     |

The token comes from `--token` or `GITHUB_TOKEN`. PRs and tags created with `GITHUB_TOKEN` trigger no workflows, so release PRs get no checks. Rulesets on `tallyrelease/*` branches or on version tags must allow the token.

## Shadow mode

While release-please owns versions, `shadow` checks that tallyrelease would have released the same versions. Run it on pushes to the default branch:

```yaml
shadow:
  if: github.event_name == 'push' && github.ref == 'refs/heads/main'
  runs-on: ubuntu-latest
  permissions:
    contents: read
  steps:
    - uses: actions/checkout@v6
      with:
        fetch-depth: 0
        persist-credentials: false
    - run: npx @tallyrelease/cli@<version> shadow --pin <version> --out shadow-report.json --summary
```

Pushes that do not change `.release-please-manifest.json` are skipped (`W_SHADOW_SKIPPED`). Each row is `match`, `mismatch`, `tallyrelease-only` or `rp-only`; known differences are labelled (`release-config`, `dependent-patch`, `absorbed-internal`, `group-vs-rp`, `separate-pr`, `squash-split`). `--strict` exits 1 on unlabelled rows. Replay an earlier release merge locally with `shadow --head <sha> --branch main`.

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
