# tallyrelease

tallyrelease reads git history and a dependency graph supplied by ecosystem plugins to decide which units of a repository are affected by a change. A later milestone adds versioning and release effects (release PRs, tags, forge releases).

## Status

v0.1 is in progress: the `affected` command, with release-please still owning versions. See [docs/design.md](docs/design.md) for the design, milestones and decisions.

## Packages

| Package              | Purpose                                 |
| :------------------- | :-------------------------------------- |
| `@tallyrelease/core` | Pure planning core and plugin contract. |
| `@tallyrelease/cli`  | The `tallyrelease` binary.              |

Configuration lives in `tallyrelease.yaml`.

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
