# tallyrelease: design

Status: v0.1 in progress. Packages: `@tallyrelease/core` (pure planning core) and `@tallyrelease/cli` (binary `tallyrelease`). Config file: `tallyrelease.yaml`. Labels: `tallyrelease: pending` / `tallyrelease: released` / `tallyrelease: stale`. Release branch: `tallyrelease/release/<branch>`. PR marker: `<!-- tallyrelease-plan:v1 ... -->`. Error codes `E_*`, warning codes `W_*`.

Core function names: `discoverUnits()` in `discover.ts`, `buildGraph()` in `graph.ts`, `computeAffected()` in `affected.ts`, `computePlan()` in `plan.ts`. Plugin hooks keep the short names `discover` and `edges`.

## A. Design

### A.1 Summary

`tallyrelease` reads git history, conventional commits and a dependency graph supplied by ecosystem plugins, and computes:

- the **build set** (what this push affected, including dependents), from v0.1;
- the **release set and versions** per branch line, from v0.2;
- release PRs, tags (including floating tags) and forge releases as effects, from v0.3.

It replaces `run-release-please` in `abinnovision/actions`. Building and publishing stay with the stacks and publishers.

### A.2 Goals and non-goals

Goals: ecosystem-agnostic core; commit-driven intent; path-based attribution; separate build and release sets; deterministic prereleases with no committed state; maintenance lines; versioned plan output; runs locally and in any CI (GitHub first); pure, fixture-tested core; correctness under cancelled or reordered CI runs.

Non-goals: building, packaging, publishing; forward-porting hotfixes; AI or heuristic release notes; replacing turbo/Nx/moon; scope-based attribution in v1; plugin distribution (local `.ts` plugins, npm plugin packages) in v1; effects and changelog as plugin hooks in v1.

### A.3 Concepts

| Term           | Definition                                                                                                                                                                                                       |
| :------------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit           | Buildable, optionally released thing: `id`, `root`, `include`/`exclude`, effective `version` (`file` \| `tag` \| `none`), `scheme`, `tagFormat`, `propagate`, owning `plugin`, namespaced `meta`.                |
| Released unit  | Unit opted in by config (`release: true` or `defaults.release: true`). Its `version` is the version source (`file` or `tag`, from the plugin unless overlaid). Every other unit is build-only (`version: none`). |
| Version source | Where a released unit's version lives: `file` (tags and version files) or `tag` (tags only). Declared by the plugin; config decides whether the unit is released.                                                |
| Edge           | `from -> to`: `to` depends on `from`. `pinned` is true when `to`'s published manifest must change when `from`'s version changes.                                                                                 |
| Global input   | Repo file whose change marks **all** units affected for the build set and is **never** attributed for releases (lockfiles, `tallyrelease.yaml`, root `tsconfig*.json`, `turbo.json`).                            |
| Ignore         | Glob dropped before any processing (build and release).                                                                                                                                                          |
| Change         | One unit of intent (normally a parsed commit) attributed to units.                                                                                                                                               |
| Line           | `default` or `maintenance`. A maintenance rule limits bumps (A.7.9).                                                                                                                                             |
| Channel        | Prerelease label, set per branch rule. No channel, no prereleases.                                                                                                                                               |
| Base tag       | Highest stable tag of a unit reachable from HEAD. Source of `from`.                                                                                                                                              |
| Line base      | Highest stable tag of a unit on HEAD's first-parent chain. Origin of the prerelease counter.                                                                                                                     |
| Build set      | Units owning files changed in `base..HEAD`, plus reverse-transitive dependents; all units if a global input changed.                                                                                             |
| Release set    | Released units with a pending bump since their base tag, including Changes absorbed from unreleased dependencies (A.7.6), after propagation and groups.                                                          |
| Plan           | `plan.json` (schema 1). `affected.json` (schema 1) is the v0.1 subset.                                                                                                                                           |

### A.4 Architecture

```
                cli (imperative shell)                               core (pure)
 tallyrelease.yaml ──> config/load (zod) ────────── TallyConfig ─────┐
 fs ──────────> fs-ctx (node:fs, tinyglobby) ─ Ctx/ReadonlyFs ─┤
 git ─────────> git/reader (execFile git) ──── GitReader ──────┼──> discoverUnits() ─> buildGraph()
 plugins/node, plugins/php (public API only) ─ Plugin[] ───────┤    computeAffected()   (v0.1)
 GITHUB_* env + Forge ─> ci/base (build base) ─ BuildBase ─────┘    computePlan()       (v0.2)
 Forge (Octokit) <── effects (v0.3: reconcile, release-pr, tags, forge-release) <── Plan
 stdout / $GITHUB_OUTPUT / files <── outputs
```

Sequence per run (v0.3 shape; earlier milestones stop early):

1. cli loads config and plugins, builds `Ctx` and `GitReader`, runs `discoverUnits()` (reconcile needs units, tag formats and schemes), resolves the build base (A.7.5).
2. cli reconciles merged release PRs (A.12): tags are created locally and pushed, then the reader's tag cache is invalidated.
3. core `computePlan()` runs graph, build set, release set, versions and `released` in one call. (`computeAffected()` is the v0.1 subset.)
4. cli runs the `release-pr` effect and writes outputs.

Plugin hooks are awaited sequentially in config order (never `Promise.all`), so warnings and merged output are deterministic. Planning at a historical commit (shadow, reconcile) uses one cli helper, `planAt(ref)`: a temporary detached worktree, a `Ctx`/`GitReader` rooted there, `computePlan()`, worktree removal.

Purity enforcement: lint rule (see Purity rules) on `packages/core/src/**` and `packages/cli/src/plugins/**`; core `tsconfig.build.json` sets `"types": []`; core `check:purity` bundles `src/index.ts` with esbuild `--platform=neutral` and fails on any Node builtin, including transitive dependency imports (see Purity rules).

### A.5 Plugin contract (`@tallyrelease/core`)

```ts
export type MaybePromise<T> = T | Promise<T>;
export const PLUGIN_API_VERSION = 1;

export interface Plugin<O = unknown> {
  apiVersion: 1; // rejected if unsupported: E_PLUGIN_API
  name: string; // /^[a-z][a-z0-9-]*$/, unique
  options?: StandardSchemaV1<unknown, O>; // validates plugins.<name> minus core-owned keys (A.6)
  discover?(ctx: Ctx<O>): MaybePromise<UnitDraft[]>;
  edges?(ctx: Ctx<O>, units: readonly Unit[]): MaybePromise<EdgeDraft[]>;
  inputs?(ctx: Ctx<O>): MaybePromise<{ global?: string[] }>; // default global inputs
  versionFiles?(ctx: Ctx<O>, unit: Unit): MaybePromise<VersionFile[]>; // only for owned units
  schemes?: Record<string, VersionScheme<any>>;
  intent?: IntentSource<O>[];
}
export function definePlugin<O>(plugin: Plugin<O>): Plugin<O>; // validates name + apiVersion, returns as-is

export interface Ctx<O = unknown> {
  readonly options: O;
  readonly repo: { readonly name: string }; // GITHUB_REPOSITORY name, else origin remote, else dir name
  readonly fs: ReadonlyFs;
  readonly log: { warn(msg: string): void; debug(msg: string): void }; // warnings land in plan.warnings
}
export interface ReadonlyFs {
  // repo-relative POSIX paths, sync
  read(path: string): string | undefined; // utf8, undefined if missing
  exists(path: string): boolean;
  glob(patterns: string[], opts?: { dirs?: boolean }): string[]; // sorted; skips .git, node_modules, vendor
}
export function defaultUnitId(root: string, repoName: string): string; // "." -> repoName, else basename

/** Read-only git access. cli implements it with `git`; core/testing ships memoryGit(dag). */
export interface GitReader {
  tags(): MaybePromise<readonly TagRef[]>; // all tags, peeled to commits
  tagsMerged(ref: string): MaybePromise<readonly TagRef[]>; // git tag --merged <ref>
  isAncestor(a: string, b: string): MaybePromise<boolean>;
  isFirstParentAncestor(a: string, b: string): MaybePromise<boolean>; // a on b's first-parent chain
  log(from: string | null, to: string): MaybePromise<readonly RawCommit[]>; // --no-merges, files --no-renames, any order
  countFirstParent(from: string | null, to: string): MaybePromise<number>;
  diffFiles(from: string, to: string): MaybePromise<readonly string[]>; // --name-only --no-renames
}
export interface TagRef {
  name: string;
  sha: string;
}
export interface RawCommit {
  sha: string;
  parents: string[];
  message: string;
  files: string[];
  date: string;
} // committer date, ISO

export type Propagate = "auto" | "patch" | "rebuild";
export type VersionSource = "file" | "tag"; // file: tags + version files written; tag: tags only
export type VersionMode = VersionSource | "none"; // effective; none: not released (build-only)

export interface UnitDraft {
  id: string;
  root: string;
  include?: string[];
  exclude?: string[];
  version?: VersionSource; // source if released, default "tag"; config decides whether it is
  scheme?: string; // default "semver"
  tagFormat?: string; // default A.10
  propagate?: Propagate; // default config.defaults.propagate
  meta?: Record<string, unknown>; // stored at unit.meta[plugin.name]
}
export interface Unit {
  readonly id: string;
  readonly root: string;
  readonly plugin: string; // "config" for config-only units
  readonly include: readonly string[];
  readonly exclude: readonly string[];
  readonly version: VersionMode; // effective (A.7.1)
  readonly scheme: string;
  readonly tagFormat: string;
  readonly propagate: Propagate;
  readonly tags: readonly string[]; // from the config overlay, sorted, unique; default []
  readonly meta: Readonly<Record<string, Readonly<Record<string, unknown>>>>;
}

export interface EdgeDraft {
  from: string;
  to: string;
  reason: string;
  pinned: boolean;
}
export interface Edge {
  from: string;
  to: string;
  reasons: string[];
  pinned: boolean;
  sources: string[];
}

export interface VersionFile {
  // read in v0.2, write in v0.3
  path: string;
  read(content: string): string | undefined;
  write(content: string, next: string, ctx: WriteCtx): string;
}
export interface WriteCtx {
  unit: Unit;
  versions: ReadonlyMap<string, string>;
} // unit id -> version in this plan

export type BumpLevel = "major" | "minor" | "patch";
export interface VersionScheme<V> {
  parse(raw: string): V | undefined; // undefined: not a version of this scheme
  format(v: V): string;
  compare(a: V, b: V): number;
  core(v: V): { major: number; minor: number; patch: number }; // limits, preMajor, floating tags
  isPrerelease(v: V): boolean; // excluded from base and line-base selection
  initial(): V; // used when no base tag and no version file (semver: 1.0.0)
  bump(v: V, level: BumpLevel): V;
  release(next: V, ctx: PreCtx): V; // stable finalisation (identity for semver)
  prerelease(next: V, ctx: PreCtx & { channel: string }): V;
}

/** Git-derived data, computed by core through GitReader before calling the scheme. */
export interface PreCtx {
  unit: Unit;
  head: string; // full sha of the planned commit
  baseTag: string | null;
  tags: readonly string[]; // ALL tags of this unit (matching tagFormat), reachable or not, scheme-sorted
  firstParent: {
    sinceLineBase: number; // countFirstParent(lineBase, head); lineBase null: from root
    total: number; // countFirstParent(null, head)
  };
}

export interface IntentSource<O = unknown> {
  name: string;
  collect(
    ctx: Ctx<O>,
    input: { from: string | null; to: string; commits: readonly RawCommit[] },
  ): MaybePromise<Change[]>;
}
export interface Change {
  sha?: string; // commit-derived: attributed via that commit's files
  units?: string[]; // explicit attribution (file-based sources)
  type: string;
  breaking: boolean;
  scope?: string;
  subject: string;
  body?: string;
  releaseAs?: { unit?: string; version: string }[]; // Release-As footers; unit from the qualified form <unit>@<version>
  pr?: number;
  date?: string;
}
```

Core built-ins (expressed through the contract, registered as internal plugin `core`): scheme `semver` (v0.2), intent source `conventional-commits` (v0.2, a small in-core parser exported as `parseCommit(message)`: header `type(scope)!: subject`, trailing `(#123)` as `pr` (also for non-conventional headers, which yield `type: ""`). Footers follow Conventional Commits: the footer block starts at the first paragraph whose first line is `Token: value` or `Token #value`, and a value runs, possibly over several lines, until the next such line. They are kept as `footers: Record<lowercased token, string[]>`; uppercase `BREAKING CHANGE`/`BREAKING-CHANGE` set `breaking`. Each commit maps to exactly one Change; the first line of each `Release-As` value becomes a `Change.releaseAs` entry (`<unit>@<version>` names a unit, a plain value applies to the units the Change is attributed to); no synthetic Changes. The plugin name `core` is reserved. No `conventional-commits-parser`, whose v7 imports `stream` and fails `check:purity`), default global input `tallyrelease.yaml`.

Commit order: `log` returns commits in any order (the cli reader uses `--topo-order`, `memoryGit` reverse declaration order; conformance checks that every commit is listed before its parents). Core never relies on it: every order-dependent rule sorts commits by committer date descending, compared as instants (`Date.parse`, since `%cI` carries offsets), then by sha ascending.

Other pure exports: `renderFloatingTags(unit, version, tags, scheme)` (A.12, used by reconcile). `./testing` exports `memoryFs`, `memoryCtx`, `memoryGit` and `gitReaderConformance(makeReader)`, a shared spec suite run against `memoryGit` (core unit tests) and the real cli reader (cli integration), so both implementations agree on ancestry, first-parent counts, tag peeling and rename handling.

**Flutter scheme sketch (paper only, validates the interface):**

```ts
type FV = { major: number; minor: number; patch: number; build: number };
const RE = /^(\d+)\.(\d+)\.(\d+)\+(\d+)$/;
const flutter: VersionScheme<FV> = {
  parse: (s) => {
    const m = RE.exec(s);
    return m
      ? { major: +m[1]!, minor: +m[2]!, patch: +m[3]!, build: +m[4]! }
      : undefined;
  },
  format: (v) => `${v.major}.${v.minor}.${v.patch}+${v.build}`,
  compare: (a, b) => cmpCore(a, b) || a.build - b.build,
  core: ({ major, minor, patch }) => ({ major, minor, patch }),
  isPrerelease: () => false, // prereleases are never tagged
  initial: () => ({ major: 0, minor: 1, patch: 0, build: 0 }),
  bump: (v, l) => ({ ...semverBumpCore(v, l), build: v.build }),
  release: (n, ctx) => ({ ...n, build: buildNo(ctx) }),
  prerelease: (n, ctx) => ({ ...n, build: buildNo(ctx) }), // stores reject "-beta.N"; channel stays in plan
};
const highestTaggedBuild = (tags: readonly string[]) =>
  Math.max(0, ...tags.map((t) => flutter.parse(stripPrefix(t))?.build ?? 0));
const buildNo = (ctx: PreCtx) =>
  Math.max(
    ctx.firstParent.total + Number(ctx.unit.meta["dart"]?.["buildOffset"] ?? 0),
    highestTaggedBuild(ctx.tags) + 1,
  );
```

Findings folded into the contract: stable versions also need git data (`release(next, ctx)`); limits and pre-1.0 rules need a numeric core (`core()`); prerelease detection is scheme-specific (`isPrerelease`); build numbers must stay above every **tagged** build including tags not reachable from HEAD, because `firstParent.total` on a maintenance branch can be lower than on `main` (`PreCtx.tags`). Known limitation: untagged prerelease builds are invisible to every other line, so teams uploading prereleases from `main` to Play need a CI-run-number build source; that belongs to the `dart` plugin and is deferred.

### A.6 Hook conflict rules

| Hook           | Called                                                    | Merge rule                                                                                                                                                                                                                                                                                                                                                                               | Conflict result                                                                                                                                 |
| :------------- | :-------------------------------------------------------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :---------------------------------------------------------------------------------------------------------------------------------------------- |
| `discover`     | Every enabled plugin, config key order                    | Concatenate. Core sets `unit.plugin`, stores `meta` at `meta[plugin.name]`. Then config `units.<root>` overlays apply field by field (overlay wins). `release` comes from config only, so a plugin cannot opt a unit in. An overlay at a root with no discovered unit **always creates** a config-only unit (`plugin: "config"`); its `id` defaults to `defaultUnitId(root, repo.name)`. | Same `id` twice: `E_DUPLICATE_UNIT` (names both owners). Same `root` from two plugins: `E_DUPLICATE_ROOT`.                                      |
| `edges`        | Every enabled plugin, plus config `deps`                  | Union, dedupe by `(from,to)`: `pinned = OR`, `reasons` and `sources` unioned and sorted.                                                                                                                                                                                                                                                                                                 | Unknown unit id: `E_EDGE_UNKNOWN_UNIT`. Self edge: `E_EDGE_SELF`. Cycles allowed (`W_CYCLE` with path); closure and propagation are cycle-safe. |
| `inputs`       | Every enabled plugin                                      | Union of plugin `global`, core `tallyrelease.yaml`, config `globalInputs`. `plugins.<name>.globalInputs: false` disables that plugin's defaults; core strips this key before validating plugin `options`.                                                                                                                                                                                | None (union).                                                                                                                                   |
| `versionFiles` | Owning plugin only, per owned unit                        | Config overlays may not add files in v1.                                                                                                                                                                                                                                                                                                                                                 | A path claimed by two units: `E_VERSION_FILE_CLAIM`.                                                                                            |
| `schemes`      | Registry built at load                                    | Name -> scheme. `semver` is reserved by core.                                                                                                                                                                                                                                                                                                                                            | Duplicate name: `E_SCHEME_CLASH`. Unknown scheme: `E_SCHEME_UNKNOWN`. Group members with different schemes: `E_GROUP_SCHEME`.                   |
| `intent`       | All sources of enabled plugins, per distinct commit range | Concatenate Changes. Per unit: bump = max. Commit-derived Changes deduped by `sha,type,breaking`, plus explicit `units`.                                                                                                                                                                                                                                                                 | Two different `releaseAs` for one unit: `E_RELEASE_AS_CONFLICT`.                                                                                |
| `options`      | At load                                                   | Validated against `plugins.<name>` minus core-owned keys (`globalInputs`).                                                                                                                                                                                                                                                                                                               | `E_PLUGIN_OPTIONS` with schema issues.                                                                                                          |

Hook rules: hooks are awaited one at a time in config order; inputs are frozen in dev/test; hooks must be deterministic for equal inputs; thrown errors are wrapped as `E_PLUGIN_HOOK` with plugin and hook name. Effects and changelog rendering are not plugin hooks in v1 (both additive later).

### A.7 Core algorithm

**A.7.1 Discovery.** As in A.6. Default `include` = `["<root>/**"]` (`["**"]` for `.`); default `exclude` = roots of units nested inside this unit (deepest root wins). Explicit `include` replaces the default; explicit `exclude` is appended. Effective version: `released = overlay.release ?? defaults.release ?? false`; `version = released ? (overlay.version ?? draft.version ?? "tag") : "none"`. An overlay `version` on an unreleased unit is allowed and takes effect once the unit is released; config-only units follow the same rule. Ids match `/^(?!\.\.?$)[A-Za-z0-9._-]+$/` (`E_UNIT_ID`); overlay `tags` match `/^[A-Za-z0-9._-]+$/` (`E_UNIT_TAG`) and are sorted and deduplicated; roots are normalized (`.` and empty segments dropped), must be repo-relative without `..` segments (`E_ROOT_INVALID`) and must exist (`E_ROOT_MISSING`). A root unit with `include: **` absorbs every file not owned by a nested unit, so `unattributed` stays empty in such repos; global inputs are still checked first, so a root `package.json` change remains global (deliberate over-build).

**A.7.2 Graph.** As in A.6. Reverse adjacency precomputed; closure is BFS with a visited set. Topological order (used for propagation and the release list): Tarjan SCCs in dependency order, members of a cycle ordered by id.

**A.7.3 Attribution (path-based only).** A path belongs to every unit whose `include` matches and `exclude` does not (`picomatch/posix` v4, `dot: true`). Commit file lists use `--no-renames`, so renames count for both old and new path. Scope narrowing/forcing is deferred.

**A.7.4 Build set (v0.1).**

```
if base == null:   all units affected, reason "all"; stop (no diff)
files     = git.diffFiles(base, head)             // tree-to-tree
files'    = files − ignore
hits      = files' ∩ globalInputs
if hits ≠ ∅:       all units affected, reason "global", build.globalInputs = hits
direct    = owners(files' − hits)                 // reason "direct"
affected  = direct ∪ reverseClosure(direct)       // reason "dependent", via = affected direct dependencies
unattributed = files' − hits − attributed
```

Tree-to-tree diff needs no special casing for merges, reverts or squash merges. Unreleased units (`version: none`) are included; build selection does not depend on release status. Output sorted by unit id.

**A.7.5 Build base resolution (cli, in order).**

| #   | Event                                                  | Rule                                                                                                                                                                                                                                                                                                                                                                      | `baseSource`                          |
| :-- | :----------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | :------------------------------------ |
| 1   | any                                                    | `--base <ref>`; must resolve, else `E_BASE_UNRESOLVED`.                                                                                                                                                                                                                                                                                                                   | `cli`                                 |
| 2   | push, `before` usable (not all-zero, ancestor of HEAD) | Look up `lastSuccess` (row 4 query). If `lastSuccess` is an ancestor of (or equal to) `before`, use it; else use `before`. Without token: `before` plus `W_NO_FORGE`. Token present but no `lastSuccess` (first adoption, renamed workflow, all runs failed): `before` plus `W_NO_LAST_SUCCESS`. Never builds less than `before`, and covers runs cancelled while queued. | `forge-last-success` or `push-before` |
| 3   | pull_request / merge_group                             | `merge-base(HEAD, pull_request.base.sha)`; `merge_group.base_sha`.                                                                                                                                                                                                                                                                                                        | `pr-merge-base` / `merge-group`       |
| 4   | push with unusable `before`, dispatch, schedule        | `lastSuccess`: workflow path from `GITHUB_WORKFLOW_REF`; `GET /repos/{o}/{r}/actions/workflows/{file}/runs?branch=<b>&status=success&event=push`; first `head_sha` that exists locally and is an ancestor of HEAD.                                                                                                                                                        | `forge-last-success`                  |
| 5   | no `GITHUB_EVENT_NAME`, no CI detected                 | `merge-base(HEAD, ref)` with `ref` from `origin/HEAD`, else the first of `origin/main`, `origin/master`, `main`, `master` that resolves. No ref or no merge base: row 6. Never `E_SHALLOW_BASE`.                                                                                                                                                                          | `local-merge-base`                    |
| 6   | fallback                                               | `base = null`, everything affected.                                                                                                                                                                                                                                                                                                                                       | `none`                                |

CI is detected when `CI` is set to anything but empty, `false` or `0`, or when any of `JENKINS_URL`, `TF_BUILD`, `CODEBUILD_BUILD_ID`, `BUILDKITE`, `GITLAB_CI`, `TEAMCITY_VERSION` or `BITBUCKET_BUILD_NUMBER` is set; detected CI without a GitHub event and unknown GitHub events use row 6. Locally (row 5), `affected` answers "what did my branch change versus the default branch": on the default branch with nothing unpushed the base is HEAD and no unit is affected. Uncommitted changes are not included.

A base sha named by the event, flag or forge that is missing locally while `git rev-parse --is-shallow-repository` prints `true` is `E_SHALLOW_BASE` (exit 1), never "everything".

When the last successful run cannot be looked up, the base falls back to `before` (row 2) or to everything (rows 4 and 6) and the document carries a warning: `W_NO_WORKFLOW_CONTEXT` if `GITHUB_REPOSITORY`, `GITHUB_WORKFLOW_REF` or `GITHUB_REF_NAME` is missing, `W_FORGE_ERROR` if the forge request fails.

**A.7.6 Release set (v0.2).** For each released unit (`version != none`):

1. **Tag matching:** `tagFormat` compiles to an anchored regex: literal parts and `{id}` are regex-escaped, `{version}` must occur exactly once (else `E_TAG_FORMAT`), becomes `(.+)` and must parse with the unit's scheme. A unit's tags are sorted by `compare`, ties broken by tag name (semver ignores build metadata for precedence). `check` and `computePlan()` fail with `E_TAG_FORMAT_OVERLAP` if two released units render the same format, or if any existing tag parses for more than one released unit. Unreleased units are never matched, so units sharing a format such as `v{version}` never fail `check` while unreleased.
2. **Base tag:** max by `compare` over `git.tagsMerged(head)` for the unit, prereleases skipped. **Line base:** highest such tag whose commit `isFirstParentAncestor(tag, head)`; may differ from the base tag after a maintenance branch is merged back. `sinceLineBase = countFirstParent(lineBase, head)` (from the root without a line base), `total = countFirstParent(null, head)`.
3. **Commits:** `git.log(baseTag, head)` (no merges), in core commit order (A.5); intent sources run once per distinct range. Files minus `ignore` minus `globalInputs`, then attribution; a Change with `units` is attributed to those units; lockfile-only commits never bump. The unit's Changes are those attributed to `{R} ∪ reach(R)` (absorption, below); each commit counts once.
4. **Own bump:** max over attributed Changes via `bumps.types` (default `feat: minor`, `fix`/`perf`/`revert: patch`, breaking: major). If `core(from).major == 0`: `preMajor.breaking` (default `minor`) and `preMajor.feat` (default `minor`).
5. **From version:** the base tag version. Without a base tag, the first release adopts the declared version as `next` (owning plugin's version file value, else `scheme.initial()`), and commits since the root decide only whether the unit is in the release set.
6. **Release-As:** overrides `next` for attributed units (must parse and exceed `from`, else `E_RELEASE_AS_INVALID`). Footers are not absorbed; a `Release-As:` attributed only to unreleased units is ignored with `W_RELEASE_AS_IGNORED`.

Unreleased units never have a pending bump. No released unit while a branch rule matches: `W_NO_RELEASED_UNITS`.

**Absorption (unreleased units are transparent to released dependents).** For a released unit `R`, `reach(R)` is the set of unreleased units found by a reverse walk over edges (any edge, pinned or not) starting at `R`'s dependencies, with a visited set, never stepping into or through a released unit. Cycles among unreleased units terminate through the visited set. Absorbed Changes contribute their bump level only: `fix`/`perf`/`revert` give a patch and `feat` a minor, as for `R`'s own commits; breaking changes in an absorbed unit are capped at `minor`, because they break in-repo callers, not `R`'s consumers (a real break of `R` is a commit attributed to `R` or `Release-As`). A commit touching an absorbed unit and `R`, or reaching `R` by two paths, is one Change. Example: a `fix:` in an unreleased `packages/db` patches every released app that depends on it, directly or through other unreleased units; a `chore:` in `packages/tsconfig` reaches the apps and bumps nothing.

**A.7.7 Propagation (v0.2).** Fixpoint over edges in topological order (terminates: bumps only increase). For `from -> to` where `from` has a bump, policy = `to.propagate`, with `auto = pinned ? patch : rebuild`. `patch` raises `to` to at least `patch` and appends `from` to `propagatedFrom`. `rebuild` changes nothing in the release set. Propagation onto an unreleased dependent is a rebuild only.

Propagation through unreleased units: a released `R1` that reaches a released `R2` only through unreleased units is treated as a direct edge `R1 -> R2`, with `pinned` taken from the first hop (`R1 -> U`), the hop that changes `U`'s shipped content. With several paths or an additional direct edge, the first-hop `pinned` values are OR-combined, as in edge dedupe (A.6). Example: `core` (released) feeds `adapter` (unreleased) feeds `app` (released); a `fix:` in `core` releases `core` and propagates to `app` per its policy.

Node pinning:

| Field                  | Exact version, `workspace:*`, `workspace:x.y.z` | `^`, `~`, `workspace:^`, `workspace:~`, other ranges |
| :--------------------- | :---------------------------------------------- | :--------------------------------------------------- |
| `dependencies`         | pinned                                          | not pinned                                           |
| `optionalDependencies` | pinned (same as `dependencies`)                 | not pinned                                           |
| `peerDependencies`     | not pinned                                      | not pinned                                           |
| `devDependencies`      | not pinned                                      | not pinned                                           |

All four produce edges (build set); only pinning differs.

**A.7.8 Linked groups (v0.2; `fixed` deferred).** Members with a bump share `next = max(bump_i(from_i))`; members without a bump are not released. Group prerelease `N` = max of members' `sinceLineBase`. Resolved before prerelease computation (fixes P3). Members must be released (`E_GROUP_NOT_RELEASED`). An absorbed bump is a pending bump: a member released only through absorption behaves like one with a direct change.

**A.7.9 Branch rules and maintenance limits (v0.2).** First rule matching `--branch` or the current branch wins. Patterns support `*` and `{major}`/`{minor}` captures.

| Rule shape                  | Default (relative) check per releasing unit               | Absolute check                                                                                              |
| :-------------------------- | :-------------------------------------------------------- | :---------------------------------------------------------------------------------------------------------- |
| `release/{major}.x`         | max bump `minor` (`core(next).major == core(from).major`) | only if the rule sets `unit: <id>` or the repo has exactly one released unit: `core(from).major == {major}` |
| `release/{major}.{minor}.x` | max bump `patch` (same major and minor as `from`)         | as above, also `core(from).minor == {minor}`                                                                |

Violation: `E_CAP` naming unit, limit and the commit(s) that produced the offending bump. Absolute mismatch: `E_CAP_BASE` (only in the absolute case). Relative limits keep monorepos correct: `release/1.x` named after `web` does not block `api` at `5.3.0` from releasing `5.3.1`. No matching rule: build set computed, versions `null`, `W_NO_BRANCH_RULE`.

Channels: literal `[0-9A-Za-z-]+`, optionally containing `{major}`/`{minor}` tokens captured by the same rule (e.g. `rc-{major}`). `check` errors: same rendered channel on two rules (`E_CHANNEL_DUPLICATE`), a channel on a rule whose pattern contains `*` (`E_CHANNEL_WILDCARD`), any other token or character (`E_CHANNEL_INVALID`).

**A.7.10 Version and kind (v0.2).**

| In build set | Pending bump | Channel | Kind                              | Version                                                                             |
| :----------- | :----------- | :------ | :-------------------------------- | :---------------------------------------------------------------------------------- |
| yes          | yes          | set     | `prerelease`                      | `scheme.prerelease(next, ctx)`; semver: `{next}-{channel}.{N}`, `N = sinceLineBase` |
| yes          | yes          | none    | `rebuild`                         | `null`                                                                              |
| yes          | no           | any     | `rebuild`                         | `null`                                                                              |
| no           | yes          | any     | `none` (listed only with `--all`) | `null`                                                                              |

Unreleased units never have a pending bump: they are kind `rebuild` when affected and never listed as kind `none` under `--all`.

Stable releases are not units of the HEAD computation. `plan.released` is derived from durable facts only: every stable unit tag whose commit lies on HEAD's first-parent chain in `(build.base, HEAD]` (all such commits when `base` is `null`). Because the build base falls back to `lastSuccess` after a failed run (A.7.5), releases whose publish failed are emitted again by the next run; publishers treat "already published" as success.

`N` monotonicity: along a line's first-parent chain, `sinceLineBase` grows by at least 1 per commit, and the line base only moves when a stable tag of the unit lands on that chain, which also raises `next`, including a tag created from the line itself (that release becomes the new `from`). Merging a maintenance branch back moves the base tag (e.g. 1.4.2 to 1.4.3) but not the line base, so `N` never drops while `next` stays 2.0.0. The sha (`plan.head`) is the deployable identity of `rebuild` units and is never part of the version string.

### A.8 Plan and affected schema (v1)

```ts
interface AffectedDoc {
  // tallyrelease affected --json (v0.1)
  schema: 1;
  tool: string; // "tallyrelease@0.1.0"
  repo: string;
  branch: string;
  head: string;
  build: {
    base: string | null;
    baseSource:
      | "cli"
      | "push-before"
      | "pr-merge-base"
      | "merge-group"
      | "forge-last-success"
      | "local-merge-base"
      | "none";
    all: boolean;
    globalInputs: string[];
  };
  units: {
    id: string;
    path: string /* = Unit.root, "." for root */;
    plugin: string;
    reason: "direct" | "dependent" | "global" | "all";
    via: string[];
    released: boolean; // Unit.version != "none"
    tags: string[]; // Unit.tags
  }[];
  unattributed: string[];
  warnings: { code: string; message: string; plugin?: string }[];
}

interface Plan extends Omit<AffectedDoc, "units"> {
  // tallyrelease plan --json (v0.2)
  line: {
    kind: "default" | "maintenance";
    channel: string | null;
    maxBump: "minor" | "patch" | null;
    absolute: { unit: string | null; major: number; minor?: number } | null;
  } | null;
  units: UnitPlan[]; // topological order, cycles by id
  released: ReleasedUnit[]; // v0.3, from release tags in (build.base, HEAD] (A.7.10)
}
interface UnitPlan {
  id: string;
  path: string /* = Unit.root */;
  plugin: string;
  scheme: string;
  group: string | null;
  affected: {
    reason: "direct" | "dependent" | "global" | "all";
    via: string[];
  } | null;
  kind: "prerelease" | "rebuild" | "none";
  baseTag: string | null;
  lineBaseTag: string | null;
  from: string | null;
  bump: BumpLevel | null;
  propagatedFrom: string[];
  absorbedFrom: string[]; // unreleased unit ids whose Changes were absorbed (A.7.6), sorted, unique
  next: string | null;
  version: string | null;
  sha: string;
  changes: {
    sha: string;
    type: string;
    breaking: boolean;
    scope?: string;
    subject: string;
    pr?: number;
  }[];
}
interface ReleasedUnit {
  // v0.3
  id: string;
  path: string;
  version: string;
  tag: string;
  floatingTags: string[];
  releaseSha: string; // commit the tag points to (PR merge_commit_sha)
  catchUp: boolean; // releaseSha != head (skipped merge run or failed publish)
  pr: number | null; // from the forge when available
  line: "default" | "maintenance";
}
```

`explain` and the changelog list absorbed Changes under the released unit with `via <unit>`. Build selection in `AffectedDoc` does not depend on release status; `released` only reports it.

The cli publishes `plan.schema.json` and `affected.schema.json` (generated from zod) in the npm package. Breaking changes bump `schema`.

### A.9 CLI surface

| Command                                                                                                      | Milestone | Purpose                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| :----------------------------------------------------------------------------------------------------------- | :-------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tallyrelease check`                                                                                         | v0.1      | Validate config, plugins, units, graph (v0.2 adds tag formats, channels). Non-zero on `E_*`. Prints `ok: N units (K released: a, b), M edges`, or `(0 released)`, with singular `1 unit` and `1 edge`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `tallyrelease graph [--format <format>] [--json]`                                                            | v0.1      | Units and edges. `--format` is `text` (default), `json` or `mermaid`; `--json` is shorthand for `--format json`, and combining them exits 2. Mermaid is a raw `flowchart LR` (solid pinned, dashed unpinned edges, released units marked). Text is a table (`UNIT`, `PATH`, `PLUGIN`, `RELEASE` with the effective version or `-`, and `TAGS` when any unit has tags), a `dependents` tree from units without dependencies (skipped without edges; `(*)` marks a unit expanded above, `(cycle)` an edge back into the current path) and a summary line; `no units` when empty. Pinned status is only in json and mermaid.                                                                                                                                                                                                                 |
| `tallyrelease affected [--base] [--format <format>] [--json] [--out <file>] [--github-output] [--tag <tag>]` | v0.1      | Build set. `--format` is `text` (default), `json` or `tsv`; `--json` is shorthand for `--format json`, and combining them exits 2. Text shows the base (short sha and its source), units grouped by reason (`all`, `global` with the changed global inputs, `direct`, `dependent`) with `via` and a `released` marker, and a summary. TSV is a header `id\tpath\treason\tvia\treleased\ttags` and one row per unit (`via` and `tags` comma-joined, `released` is `true` or `false`). `--tag` (repeatable) keeps units with at least one of the given tags in `units` of every format and output (`via` may name dropped units); `build` is unchanged and the text summary counts only tagged units. A tag no unit has warns `W_TAG_UNKNOWN`. Text layout may change between versions; `json`, `tsv` and `mermaid` are the stable formats. |
| `tallyrelease plan [--branch] [--base] [--head <ref>] [--all] [--json] [--out] [--github-output]`            | v0.2      | Full plan, read-only.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `tallyrelease explain <unit>`                                                                                | v0.2      | Why affected or bumped: files, commits, edges.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `tallyrelease shadow [--manifest <path>] [--out <file>] [--strict]`                                          | v0.2      | Shadow comparison (A.13).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `tallyrelease version`                                                                                       | v0.3      | Apply version files and changelogs locally.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `tallyrelease pr` / `tallyrelease release` / `tallyrelease run`                                              | v0.3      | Release PR effect / reconcile merged release PRs / CI entry point (release then pr then outputs).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |

Global flags: `--cwd`, `--config`, `--token` (else `GITHUB_TOKEN`), `--verbose`. Exit codes: `0` ok, `1` error (printed as `error[E_*]: message`), `2` usage. Warnings print as `warning[W_*]: <plugin: >message`. On a terminal, output is colored via `node:util` `styleText` (`NO_COLOR` and `FORCE_COLOR` apply). Commands run at the repository root and fail with `E_NOT_REPO_ROOT` in a subdirectory unless `--cwd` points at the root, with `E_NOT_A_REPO` outside a git repository and with `E_CWD_MISSING` when the directory does not exist. The cli entry is `main(argv, deps)` with `deps = { env, cwd, stdout, stderr, git?, fs?, forge? }`; `bin.ts` wires real deps; tests inject `memoryGit`, `memoryFs` and `fakeForge` in-process.

### A.10 Configuration (`tallyrelease.yaml`)

Defaults: units are not released (`release: false`, `version: none`); `tagFormat` = `{id}-v{version}`; a unit at root `.` defaults to `v{version}` (release-please parity for single repos); `propagate: auto`.

The config schema is published as `dist/tallyrelease.schema.json` (export `@tallyrelease/cli/tallyrelease.schema.json`, also on jsDelivr), generated from the zod `configSchema`; an optional top-level `$schema` key is accepted and ignored.

Releasing is an explicit repo decision. `release: true` (per unit) or `defaults.release: true` (all units, with `release: false` opt-outs) opts units in; the plugin's version source applies unless an overlay sets `version: file | tag`. `version: none` is rejected with `E_CONFIG` (hint: `use release: false`).

Unit overlays accept `tags` (labels such as `docker` or `npm`, same characters as ids) to split the build set by kind with `affected --tag`. There are no default or plugin-provided tags.

```yaml
# Yarn monorepo (app-stack consumer)
plugins:
  node: {} # map: only listed plugins run, in this order
defaults:
  tagFormat: "{id}-source-v{version}" # set to the repo's existing tags for shadow parity
units: # overlays keyed by root path; undiscovered root => config-only unit
  ".": {} # id defaults to the repo name; build-only
  "apps/web": { id: web, release: true, tags: [docker] } # tags: labels for affected --tag
  "packages/api-client": { release: true }
  "packages/api-types": { release: true }
  "infra/tf": { id: tf, release: true } # config-only unit, version source tag
deps:
  - { from: api-types, to: tf, pinned: false }
ignore: ["**/*.md", ".github/**"]
globalInputs: [".tool-versions"] # unioned with node defaults and tallyrelease.yaml
# v0.2
groups:
  - { name: sdk, mode: linked, units: [api-client, api-types] } # mode fixed: E_UNSUPPORTED in v1
branches:
  - { name: main, line: default, channel: beta }
  - { name: "release/{major}.x", line: maintenance }
  - { name: "release/{major}.{minor}.x", line: maintenance }
bumps:
  types: { feat: minor, fix: patch, perf: patch, revert: patch }
  preMajor: { breaking: minor, feat: minor }
# v0.3
tags:
  floating: ["{id}-v{major}", "{id}-v{major}.{minor}"]
```

```yaml
# PHP single repo
plugins:
  php: {}
units:
  ".": { release: true }
branches:
  - { name: main, line: default }
  - { name: "{major}.x", line: maintenance } # single released unit: absolute check applies
tags:
  floating: ["v{major}"]
```

```yaml
# App monorepo (groundwork): internal packages are absorbed into the apps
plugins:
  node: {}
units:
  "apps/api-server": { release: true }
  "apps/groundwork": { release: true }
```

```yaml
# Library monorepo (this repo)
plugins:
  node: {}
units:
  packages/core: { id: core, release: true }
  packages/cli: { id: cli, release: true }
```

```yaml
# Many published packages
plugins:
  node: {}
defaults:
  release: true
units:
  packages/tsconfig: { release: false }
```

Node defaults: discovery from `workspaces` (yarn/npm) or `pnpm-workspace.yaml`; a single-package repo is unit `.`; a workspace root `package.json` is not a unit unless overlaid. Global inputs: `yarn.lock`, `package-lock.json`, `pnpm-lock.yaml`, `.yarnrc.yml`, `.yarn/patches/**`, root `package.json` (workspace repos), root `tsconfig*.json`, `turbo.json`. Ids via `defaultUnitId`; `meta.node.packageName`; version source `file`. PHP: unit from root `composer.json` plus `composer.json` under `repositories[type=path].url` globs; edges from `require`/`require-dev` naming a local package (pinned only for exact constraints in `require`); version source `tag`, no version files; global input `composer.lock`.

### A.11 CI integration (`abinnovision/actions`)

A JS action (`run-tallyrelease`, `node24` runtime) in `abinnovision/actions` runs the published cli.

| `$GITHUB_OUTPUT` key  | Milestone | Value                                                                 |
| :-------------------- | :-------- | :-------------------------------------------------------------------- |
| `affected`            | v0.1      | Compact JSON array `[{id,path,plugin,reason,released,tags}]`          |
| `affected-paths`      | v0.1      | Newline list of paths (multiline delimiter syntax)                    |
| `all`                 | v0.1      | `true` when base is `null` or a global input hit                      |
| `base`, `base-source` | v0.1      | Resolved base sha (empty if none) and its source                      |
| `plan`                | v0.2      | Path of the written `plan.json` (`tallyrelease plan --github-output`) |
| `releases`            | v0.3      | Release list v2 (includes `catchUp`), topological order, cycles by id |

Requirements (README): checkout with `fetch-depth: 0` (or `filter: blob:none`); `actions: read` for base lookup; one run per branch via `concurrency` without `cancel-in-progress` on pushes (queued runs may still be replaced, which A.7.5 row 2 and A.12 reconciliation tolerate); tags pushed with `GITHUB_TOKEN` do not trigger workflows, so publishing runs in the same workflow from `releases`; entries with `catchUp: true` must be built from `releaseSha`, not HEAD, and outside the `affected-paths` filter, since a caught-up unit may not be in HEAD's build set (actions-repo task); the default token is the plain `GITHUB_TOKEN`, and PRs it creates do not trigger workflows, so users who need required checks on release PRs pass another token with `--token`.

`abinnovision/actions` itself publishes actions as orphan commits with built `dist`. tallyrelease only owns its reachable `{id}-source-v{version}` tags there (`tags.floating` unset); the existing actions-repo step keeps creating orphan commits, version tags and floating tags from `plan.released`. Tier 2 local plugins are therefore not a prerequisite for M4a.

Rollout: M2a app-stack input `build-selection: affected|all` (default `all`) filters prune, pack and image matrices by `affected-paths`.

### A.12 Release flow (v0.3)

Every run on a line branch, after step 1 of A.4 (config, plugins, `discoverUnits()`, build base):

1. **Reconcile (tagging).** List closed PRs with head `tallyrelease/release/<branch>`, base `<branch>`, `merged_at` set and label `tallyrelease: pending`, oldest first. The label is only a work queue for tagging; publishing never depends on it. For each PR, parse the marker `<!-- tallyrelease-plan:v1 base64({ head, releaseCommit, releases: [{ id, version, tag }] }) -->` and require:
   - `pr.head.sha == releaseCommit` (body and branch belong together; a racing rewrite fails this),
   - `merge_commit_sha` is an ancestor of HEAD,
   - **plan equality:** `planAt(firstParent(merge_commit_sha))` yields a release set whose `{ id, version, tag }` equals the marker's `releases`. This accepts merge queues and "Update branch" merges where main moved without changing the release, and rejects merges whose versions would now differ.

   Valid: create tags locally at `merge_commit_sha` (existing tag on the same sha: no-op; different sha: `E_TAG_EXISTS`), render floating tags with `renderFloatingTags()`, then `git push origin <tags>` (floating tags with `--force`). Invalidate the `GitReader` tag cache. Create forge releases (`make_latest: false` on maintenance lines). Relabel `tallyrelease: released`. Invalid: relabel `tallyrelease: stale` and comment why; no tags.

2. **Plan** at HEAD. Tags from step 1 are visible because they exist in the local repo and the cache was invalidated. `plan.released` comes from tags in `(build.base, HEAD]` (A.7.10), so a release whose publish failed is re-emitted until a run succeeds.
3. **Release PR.** Release set empty: close an open release PR with a comment. Otherwise reset a local branch to HEAD, apply version file writes and the changelog writer, commit `chore(release): <ids@versions>` (`releaseCommit`). Re-read PR state; skip closed or merged PRs (open a new one). Skip the push if the open PR's head commit has the same tree **and** the same parent (HEAD) as the new commit; otherwise `git push --force-with-lease=refs/heads/tally/release/<branch>:<last seen sha>`, with an empty expected value (`refs/heads/tally/release/<branch>:`) when the remote branch does not exist. Create or update the PR (label `tallyrelease: pending`). The body-edit skip compares a hash over the full rendered body, which includes the marker with `head` and `releaseCommit`.

**PR body size.** The marker carries only `{ head, releaseCommit, releases }`, never the full plan. The human changelog part is truncated with a note so the body stays under 60,000 characters (GitHub limit 65,536).

**Floating tags** (`tags.floating`, tokens `{id}`, `{major}`, `{minor}`): `renderFloatingTags(unit, version, tags, scheme)` (pure, core) returns a name only if the released version is the highest stable version among all of the unit's tags that render to the same name. So `v1` moves to `1.4.3` on `release/1.x` while `v2` stays put, and a maintenance release never moves a newer line's tag.

**Changelog writer** (core, pure, not a plugin hook): `<root>/CHANGELOG.md`, section heading `## <version> (<date>)` where date is the newest attributed commit's committer date (deterministic across reruns). It replaces every existing section whose version is greater than the base tag version (untagged leftovers) with the single new section, so reruns and stale recoveries never duplicate sections.

**Stale recovery.** A stale merge (plan equality fails) leaves the release commit on main without tags. The next plan still uses the old base tag; the `chore(release)` commit causes no bump; version file writers set versions to the new `next` and the changelog writer replaces the untagged section. The next release PR therefore contains exactly one changelog section above the base tag and version files equal to the new plan.

Effects are idempotent and support `--dry-run`.

### A.13 Shadow mode (v0.2)

- **Trigger:** only pushes whose `git diff --name-only HEAD^1 HEAD` contains the release-please manifest (default `.release-please-manifest.json`), i.e. a release-please release PR merge. Other pushes exit 0 with `W_SHADOW_SKIPPED`.
- **Compute:** read the manifest at `HEAD^1` and `HEAD`; changed paths = keys whose value changed. Run `planAt(HEAD^1)` (A.4) with the current branch's rule.
- **Compare:** for each changed path, tallyrelease `next` of the unit with that `path` vs the manifest's new value (`match` / `mismatch`). Also report `tallyrelease-only` (tallyrelease release set, path not changed) and `rp-only` (changed path, no tallyrelease bump or no unit). Known divergence classes are labelled: `dependent-patch` (release-please `node-workspace` patch bump vs `propagate: auto`), `linked-vs-rp`, `stale-rp-pr`, `release-config` (a manifest path whose unit is unreleased, or a released unit missing from the manifest), `absorbed-internal` (a bump from absorbed Changes; release-please ignores paths outside its `packages`).
- **Evidence:** job summary table, `::warning` annotations, `shadow-report.json` (`--out`) uploaded as an artifact, and a tracking issue that lists every comparison run URL. `--strict` exits 1 on any unlabelled mismatch.
- **Gate to v0.3 switch:** at least 10 compared stable unit releases **combined** across this repo and the consumer (E10), with at least 3 from the consumer, **and** at least 2 weeks of shadow runs in both, with zero unexplained mismatches. v0.2 Task 5 adds `branches` and `defaults.propagate: patch` (mirroring release-please `node-workspace`) to this repo's `tallyrelease.yaml`; the consumer gets the equivalent.

---

## C. Milestones

Conventions: tests prefer fakes at seams over module mocks (no `vi.mock` of modules, no `vitest-mock-extended`). Core scenarios are YAML in `packages/core/test/scenarios/` describing config, plugin stubs and a commit DAG served by `memoryGit`. Most cli integration scenarios call `main(argv, deps)` in-process with `memoryGit`, `memoryFs` and `fakeForge` (records calls, serves canned runs and PRs). `gitReaderConformance(makeReader)` runs against `memoryGit` and the real reader. A few scenarios use real git in tmp repos: G07 (shallow), G10 (yarn e2e), G11 (php e2e), G16 (conformance), G29 (local merge base). The GitHub forge adapter has one spec against a local `node:http` server via its `baseUrl` (`GITHUB_API_URL`). Harnesses stay small.

### v0.1: `affected` (release-please still owns versions)

| #   | Task                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Acceptance criteria                                                                                                                                                                                                                                                                    |
| :-- | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Scaffold the repo from the service template (no self-check job yet); core/cli export a version constant.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | `yarn install --immutable`, `yarn check` (incl. `check:purity`), `yarn build`, `yarn test-unit`, `yarn turbo test-integration` pass locally and in CI; `test/purity.spec.ts` green.                                                                                                    |
| 2   | Core contract, `memoryGit`, `discoverUnits`, `buildGraph`, attribution, `computeAffected`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Core scenarios below green; public types and `./testing` exported.                                                                                                                                                                                                                     |
| 3   | `node` plugin (public API only).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Specs: yarn/npm/pnpm discovery, single-package repo, pinning table (A.7.7), default global inputs, `meta.node.packageName`.                                                                                                                                                            |
| 4   | `php` plugin.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Specs: single repo unit `.` with repo-name id, path-repo monorepo, `require` edges, `composer.lock` global input, no version files.                                                                                                                                                    |
| 5   | Cli: `main(argv, deps)`, config load, `GitReader` (passes `gitReaderConformance`), minimal `Forge` (`lastSuccessfulPushRuns`) + GitHub adapter + `fakeForge`, build base, `check`, `graph`, `affected`, outputs. Write this repo's `tallyrelease.yaml` (`node`, overlays `packages/core: { id: core, release: true }`, `packages/cli: { id: cli, release: true }`; the tag format is adjusted to match release-please component tags after the first release). Add `self-check` job: `permissions: { contents: read, actions: read }`, `env: GITHUB_TOKEN: ${{ github.token }}`, checkout `fetch-depth: 0`, build, `tallyrelease check`, `tallyrelease affected --github-output`. | Integration scenarios below green; `--json` validates against `affected.schema.json`; self-check job green on a PR and on `main`; on `main`, `base-source` is `forge-last-success` or `push-before` and `W_NO_FORGE` is absent.                                                        |
| 6   | Release 0.1.0 via release-please and npm. In `abinnovision/actions` (separate repo): `run-tallyrelease` action and M2a. Sandbox `abinnovision/tallyrelease-sandbox-yarn` (E9): `packages/ui`, `apps/web` (depends on ui `workspace:^`), `apps/api`; `.github/workflows/ci.yaml` calls app-stack from the M2a branch with `build-selection: affected`.                                                                                                                                                                                                                                                                                                                             | `affected-paths` is ordered by unit id; prune/pack matrix entries equal it as a set. Push touching `packages/ui/src/button.ts`: `packages/ui`, `apps/web`. Touching `apps/api/src/main.ts`: `apps/api`. Touching `yarn.lock`: all three, `all=true`. Touching only `README.md`: empty. |

Core scenarios (plus `gitReaderConformance(memoryGit)`): `A01-direct-single`, `A02-dependent-via`, `A03-transitive-diamond-dedupe`, `A04-global-input-lockfile`, `A05-ignore-only-change`, `A06-unattributed-reported`, `A07-nested-roots-deepest-wins`, `A08-rename-across-units`, `A09-version-none-included` (unreleased units are affected), `A10-null-base-all`, `A11-cycle-closure-warns`, `A12-tallyrelease-yaml-global-input`, `A13-custom-config-file-global-input`, `A14-glob-metacharacters-in-root`, `C01-duplicate-unit-id`, `C02-duplicate-root`, `C03-edge-unknown-unit`, `C04-edge-dedupe-pinned-or`, `C05-api-version-rejected`, `C06-config-only-unit-and-deps`, `C07-meta-namespaced`, `C08-plugin-options-invalid`, `C09-global-inputs-disabled-per-plugin`, `C10-root-overlay-default-id` (root overlay without id creates unit with repo-name id; absorbs otherwise unattributed files; root `package.json` still global), `C11-plugin-options-global-inputs-stripped`, `C12-root-missing` (`E_ROOT_MISSING`), `C13-plugin-hook-error`, `C14-edge-self`, `C15-plugin-unknown`, `C16-unit-id-dot`, `C17-root-invalid`, `C18-root-normalized`, `C19-default-not-released`, `C20-release-opt-in-uses-plugin-source`, `C21-defaults-release-with-opt-out`, `C22-overlay-version-source-override`, `C23-config-only-unit-released-tag`.

Cli integration: `G01-push-before`, `G02-zero-before-forge-fallback`, `G03-zero-before-no-token-all`, `G04-pr-merge-base`, `G05-merge-group-base`, `G06-force-push-falls-through`, `G07-shallow-missing-base-error` (uses `--is-shallow-repository`, also inside a linked worktree), `G08-cli-base-override`, `G09-github-output-format`, `G10-yarn-monorepo-e2e`, `G11-php-single-repo-e2e`, `G12-check-reports-errors-exit-1`, `G13-cancelled-pending-run` (P1 success, P2 run cancelled, P3 run: base = P1, units from P2 included), `G14-github-forge-local-http`, `G15-no-last-success-uses-before` (token present, no successful run: base = `before`, `W_NO_LAST_SUCCESS`), `G16-git-reader-conformance` (real reader passes `gitReaderConformance`), `G17-config-version-none-rejected` (`E_CONFIG` with hint `use release: false`), `G18-check-lists-released-units` (including the `0 released` form), `G19-graph-formats` (`--format text|mermaid|json`: text table and tree, `dependents` omitted without edges, `no units`; `--json` conflict and unknown format exit 2), `G28-affected-text-and-tsv` (grouping, `global` changed line, `released` marker, every base label, summary plurals, TSV, `--json --format tsv` exits 2), `G29-local-merge-base` (feature branch against `origin/HEAD`; `CI` and `JENKINS_URL` build everything; without a remote local `main` is the base; without `main`/`master` everything). G11 also asserts the `graph` version column.

### v0.2: planner + shadow

| #   | Task                                                                                                                                                                                                                                                                          | Acceptance criteria                                                            |
| :-- | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :----------------------------------------------------------------------------- |
| 1   | `semver` scheme, scheme registry, test-only flutter sketch scheme.                                                                                                                                                                                                            | Scheme specs; `R21` passes using only the public `VersionScheme` and `PreCtx`. |
| 2   | `conventional-commits` intent source, in-core parser (`type(scope)!:`, `BREAKING CHANGE:`, `Release-As:`, squash `(#123)` -> `pr`).                                                                                                                                           | Parser specs; `check:purity` still green.                                      |
| 3   | Tag matching (released units only), base and line-base tags, release set, absorption and propagation through unreleased units, linked groups (`E_GROUP_NOT_RELEASED`), branch rules, limits, channels, kinds, `W_RELEASE_AS_IGNORED`, `W_NO_RELEASED_UNITS`, `computePlan()`. | Core scenarios below green.                                                    |
| 4   | Cli `plan` (incl. `--head`, `--github-output`), `explain`, `plan.schema.json`.                                                                                                                                                                                                | Integration scenarios below green.                                             |
| 5   | `shadow` command (A.13); add `branches` and `defaults.propagate: patch` to this repo's `tallyrelease.yaml`; shadow jobs in this repo and the shadow consumer.                                                                                                                 | Gate in A.13 met, evidence in the tracking issue; then enable `--strict`.      |

Core scenarios: `R01-two-feats-one-fix-prerelease`, `R02-n-stable-under-attribution-change`, `R03-premajor-breaking-minor`, `R04-release-as`, `R05-caret-dependent-rebuild-only`, `R06-exact-pinned-dependent-patch`, `R07-workspace-star-pinned`, `R08-linked-group-stable-max`, `R09-linked-group-prerelease-n-max`, `R10-maintenance-1x-after-2.0.0`, `R11-feat-on-patch-line-limit-error`, `R12-base-tag-skips-prerelease-and-unreachable`, `R13-merge-and-squash-commits`, `R14-no-base-tag-initial`, `R15-rebuild-vs-none-kinds`, `R16-branch-without-channel`, `R17-php-tag-only-release`, `R18-lockfile-only-no-bump`, `R19-channel-rule-checks`, `R20-cycle-propagation-fixpoint`, `R21-flutter-sketch-scheme` (incl. maintenance build above highest tagged build), `R22-no-branch-rule-warning`, `R23-maintenance-merged-back-n-monotonic`, `R24-tag-format-overlap-and-escaping`, `R25-monorepo-maintenance-relative-limit`, `R26-maintenance-absolute-single-unit`, `R27-channel-tokens`, `R28-peer-and-optional-pinning`, `R29-absorb-unreleased-dependency`, `R30-absorb-stops-at-released-unit`, `R31-absorbed-chore-no-bump`, `R32-tag-overlap-ignores-unreleased`, `R33-propagate-through-unreleased`, `R34-absorbed-breaking-capped`, `R35-absorb-dedupe-and-cycle`, `R36-absorbed-bump-in-linked-group`.

Cli integration: `G20-tags-merged-and-ranges`, `G21-first-parent-counts-with-merges`, `G22-maintenance-branch-from-tag`, `G23-shadow-match`, `G24-shadow-mismatch-strict-exit-1`, `G25-shadow-skips-non-manifest-push`, `G26-plan-schema-valid`, `G27-plan-github-output`.

### v0.3: effects + switch

| #   | Task                                                                                                                                                                                              | Acceptance criteria                                                                                                                                                              |
| :-- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Extend `Forge` (PRs incl. merged lookup, labels, refs, releases) and `fakeForge`.                                                                                                                 | Adapter spec against local HTTP server.                                                                                                                                          |
| 2   | Version file writes (node `package.json` version + pinned dependent ranges); idempotent changelog writer; `tallyrelease version`.                                                                 | `E01`.                                                                                                                                                                           |
| 3   | `release-pr` effect with re-read, tree-equality skip, `--force-with-lease`, body-hash skip; `tallyrelease pr`.                                                                                    | `E02`, `E03`, `E06`, `E10`.                                                                                                                                                      |
| 4   | Reconcile (A.12: plan equality via `planAt`, local tags + push, cache invalidation), `renderFloatingTags`, forge releases, `plan.released` from tags; `tallyrelease release`, `tallyrelease run`. | `E04`, `E05`, `E07`, `E09`, `E11`, `E12`, `E14`, `E15`, `E16`.                                                                                                                   |
| 5   | Release list v2 with `catchUp`, topological order.                                                                                                                                                | `E08`, `E13`; publishers accept v1 and v2, build `catchUp` entries from `releaseSha` outside the `affected-paths` filter, and treat already-published as success (actions repo). |
| 6   | Dogfood: this repo's `ci.yaml` switches to `tallyrelease run` from the previously published version; remove release-please files.                                                                 | One full release cycle of `core` and `cli` by tallyrelease. Then actions M4a-M4d (A.11 orphan-commit note).                                                                      |

Cli integration: `E01-version-files-written`, `E02-release-pr-create-then-update-idempotent` (first push uses empty-lease `--force-with-lease`; body under 60,000 characters with 200 units; marker holds only `head`, `releaseCommit`, `releases`), `E03-empty-release-set-closes-pr`, `E04-merged-pr-tags-at-merge-sha`, `E05-stale-merge-refused-and-recovered` (no tags; next release PR has exactly one changelog section above the base tag; version files equal the new plan), `E06-rerun-noop-no-push-no-body-edit`, `E07-maintenance-make-latest-false`, `E08-release-list-v2-kinds`, `E09-merge-run-skipped-next-push-tags`, `E10-pr-body-race-rejected`, `E11-floating-tags-highest-only`, `E12-tag-exists-different-sha-error`, `E13-catch-up-entry-release-sha`, `E14-reconcile-then-plan-same-run` (tags created in reconcile appear in the same run's `plan.released` and base tags), `E15-merge-queue-ahead-noop-accepted` (main moved before merge without changing the release set: tagged), `E16-publish-failure-reemitted` (run after a failed run re-emits the release from tags).

### Later (no committed order)

`dart` plugin + `flutter` scheme + `changelog` plugin hook; `generic` (regex version files) + `markers`; `fixed` groups; `calver`; `changesets` intent source; `go` with an additive `validate?(ctx, plan)` hook for the `/vN` module path rule; scope narrowing/forcing; Tier 2 local plugins (jiti) and Tier 3 npm plugin packages; standalone binary (SEA); `tallyrelease import release-please`.

---

## Purity rules

Core stays free of I/O so that `computePlan()` is deterministic and testable. Enforcement has three layers:

- Lint (`packages/core/eslint.config.ts`): `src/**/*.ts` (except specs) may not import Node builtins (`fs`, `path`, `os`, `child_process`, `net`, `http`, `https`, `http2`, `dgram`, `dns`, `tls`, `worker_threads`, `cluster`, `process`, `vm`) or `@tallyrelease/cli`, and may not use the globals `process`, `fetch`, `require`, `Buffer`.
- Types: core `tsconfig.build.json` sets `"types": []`.
- Bundle check: `check:purity` (`packages/core/scripts/check-purity.mjs`) bundles `src/index.ts` with esbuild for `--platform=neutral`. Any Node builtin import fails, including imports pulled in by dependencies, which lint cannot see. It runs in turbo `check` and CI. `test/purity.spec.ts` proves the check fails on a `node:fs` import (`test/purity/violation.ts`).

Built-in plugins in `packages/cli/src/plugins/**` use the public API only. Lint there forbids Node builtins, the same globals, and relative imports that leave `src/plugins/**`; plugins import only `@tallyrelease/core` and other plugin files.

---

## Decisions

| #   | Decision                          | Answer                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| :-- | :-------------------------------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| E1  | Naming                            | Product `tallyrelease`, npm scope `@tallyrelease`. Packages `@tallyrelease/core` and `@tallyrelease/cli` (bin `tallyrelease`). Config `tallyrelease.yaml`. Labels `tallyrelease: *`, branch `tallyrelease/release/<branch>`.                                                                                                                                                                                                                               |
| E2  | Second v1 plugin                  | `php`.                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| E3  | Publish core separately from v0.1 | Yes. The cli depends on it at runtime; plugin authors need its types and `./testing`.                                                                                                                                                                                                                                                                                                                                                                      |
| E4  | Node engines                      | `>=24`.                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| E5  | Default `preMajor`                | `breaking: minor`, `feat: minor`; shadow consumers set it explicitly.                                                                                                                                                                                                                                                                                                                                                                                      |
| E6  | Shadow parity strategy            | Shadow with `propagate: patch`, switch to `auto` at cutover with a changelog note.                                                                                                                                                                                                                                                                                                                                                                         |
| E7  | Repo visibility and licence       | Public, Apache-2.0.                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| E8  | Release PR token                  | Plain `GITHUB_TOKEN` by default; `--token` overrides. PRs and tags created with `GITHUB_TOKEN` do not trigger workflows, so users who need checks on release PRs pass another token.                                                                                                                                                                                                                                                                       |
| E9  | Sandbox repo                      | Later. The npm release, actions repo work and sandbox are outside v0.1 for now.                                                                                                                                                                                                                                                                                                                                                                            |
| E10 | Shadow consumer                   | The owner picks later.                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| E11 | Release opt-in                    | Units are build-only unless `release: true` (per unit or `defaults.release`). Plugins declare the version source (`file`/`tag`), config decides releasability; `Unit.version` stays the single effective value. Unreleased units are absorbed into released dependents (A.7.6), a deliberate divergence from release-please. Alternatives rejected: flipping `version` to default `none`, plugin heuristics such as `!private`, a top-level selector list. |

---

## Risks and mitigations

| Risk                                                                    | Mitigation                                                                                                                                                                                                                        |
| :---------------------------------------------------------------------- | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Queued runs replaced by concurrency, under-building or losing releases. | Build base takes `lastSuccess` when it is older than `before` (G13); every run reconciles all merged pending release PRs (E09); `plan.released` is derived from tags in `(base, HEAD]`, so failed publishes are re-emitted (E16). |
| Catch-up releases built from the wrong commit.                          | `catchUp: true` + `releaseSha` in release list v2; publishers build those entries from `releaseSha` (actions task, gate for M4b).                                                                                                 |
| PR body or branch rewritten during merge.                               | `releaseCommit` in marker, `pr.head.sha` check, re-read before push, `--force-with-lease` (E10 scenario).                                                                                                                         |
| Shadow mismatches by design.                                            | Labelled divergence classes; `propagate: patch` during shadow; gate needs zero **unexplained** mismatches.                                                                                                                        |
| Repo forgets to opt units in; nothing releases.                         | `check` lists released units; `W_NO_RELEASED_UNITS` (v0.2); shadow class `release-config`.                                                                                                                                        |
| Attribution surprises (shared root files).                              | `globalInputs`, `ignore`, `unattributed`, `explain`.                                                                                                                                                                              |
| Plugin contract churn after publishing core.                            | `apiVersion` gate; `PreCtx.tags` and `GitReader` settled before 1; changelog and validate hooks are additive later.                                                                                                               |
| Prerelease collisions.                                                  | Line-base `N` (R23); channel checks (R19, R27); force-push on line branches unsupported.                                                                                                                                          |
| Line branch fast-forwarded to a branch that merged main in.             | Unsupported, like force-push: the first-parent chain changes, so the line base and `N` can drop. Merge into line branches instead.                                                                                                |
| Duplicate publish on workflow rerun.                                    | Same version recomputed; publishers treat "already published" as success (actions task).                                                                                                                                          |
| Hidden I/O in core dependencies.                                        | `check:purity` neutral bundle in CI.                                                                                                                                                                                              |
| Release PR checks never run (`GITHUB_TOKEN` events).                    | Documented; users who need checks pass another token with `--token`.                                                                                                                                                              |
| tallyrelease releasing itself breaks.                                   | release-please releases tallyrelease until v0.3; afterwards CI uses the previous published version.                                                                                                                               |

---

## ADR

**Decision.** Build `tallyrelease` as two packages (pure `core`, imperative `cli`) with a versioned plugin contract from day one. Core reads files and git only through injected `ReadonlyFs` and `GitReader`. Ship build selection (`affected`) first, then the versioning planner validated in shadow mode against release-please, then effects (release PR, tags, floating tags, forge releases) and the switch. Built-ins `node` and `php` use only the public API. Every run reconciles from durable facts (tags, first-parent history, PR state).

**Drivers.** Migration risk for existing consumer repos; determinism and testability; reaching PHP/Flutter without core changes.

**Alternatives considered.** single package; full planner first; shadow first; `generic` as second plugin; cli-side hook invocation with precomputed git facts; green refs for build base; `before`-only build base; attributed-commit or reachable-base prerelease counter; commit trailers and input hash for merge detection; HEAD-only merge detection; strict first-parent stale check; label-driven publishing; absolute branch-pattern caps.

**Why chosen.** Two packages give a hard purity boundary at minimal cost, backed by lint, `types: []` and a neutral bundle. `GitReader` injection makes `computePlan()` one call and lets scenarios describe real DAGs. `affected` first delivers build selection with zero versioning risk. `php` stresses tag-only versioning. Durable reconciliation (lastSuccess vs `before`, merged-pending PR lookup, `releaseCommit` and plan-equality checks, `plan.released` from tags) survives cancelled runs, merge queues, races and failed publishes. Line-base `N` stays monotonic across maintenance merge-backs; relative limits keep monorepo maintenance lines usable.

**Consequences.** Core is async; `memoryGit` must model first-parent ancestry. Two integration passes in `abinnovision/actions`, plus a publisher change for `catchUp` entries. Every push run makes one forge call for the base. cli is a large package until split. release-please and tallyrelease run side by side through v0.2.

**Follow-ups.** Split cli when a second consumer appears; Tier 2/3 plugin loading; `dart`/`flutter` with `changelog` hook; `generic`; `fixed` groups; `calver`; `changesets`; `go` with `validate` hook; SEA binary; release-please importer; SchemaStore registration for `tallyrelease.yaml` (the schema is already published).
