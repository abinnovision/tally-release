# Changelog

## [0.3.0](https://github.com/abinnovision/tally-release/compare/cli-v0.2.0...cli-v0.3.0) (2026-10-16)


### Features

* **cli:** add kustomize plugin for affected detection ([#45](https://github.com/abinnovision/tally-release/issues/45)) ([781e6c5](https://github.com/abinnovision/tally-release/commit/781e6c5d96add66d27095aa85116889f4f885615))
* **cli:** add release forge methods and a git writer ([#31](https://github.com/abinnovision/tally-release/issues/31)) ([608dfdf](https://github.com/abinnovision/tally-release/commit/608dfdfdbcf683f183dd818b06f54fb37aebb02e))
* **cli:** add tallyrelease pr for shared and separate release PRs ([#34](https://github.com/abinnovision/tally-release/issues/34)) ([5dbb294](https://github.com/abinnovision/tally-release/commit/5dbb2944a6f9535511710cbcfa5c6ddfccb14fe8))
* **cli:** add tallyrelease run and fill released in plans ([#36](https://github.com/abinnovision/tally-release/issues/36)) ([8d90546](https://github.com/abinnovision/tally-release/commit/8d905469ed398a6daaa0e09f4fd9eb9c4c79c818))
* **cli:** write the releases list from tallyrelease run ([#37](https://github.com/abinnovision/tally-release/issues/37)) ([bc93e36](https://github.com/abinnovision/tally-release/commit/bc93e367b16fd3bcb8c76293e33cc6a58efe5eca))
* **core:** add changelog writer, release items and PR marker ([#30](https://github.com/abinnovision/tally-release/issues/30)) ([e74244e](https://github.com/abinnovision/tally-release/commit/e74244ebc4752e3de39614159ef0761f1cd2a33c))
* tag merged release PRs with tallyrelease release ([#35](https://github.com/abinnovision/tally-release/issues/35)) ([0058045](https://github.com/abinnovision/tally-release/commit/005804542b3f0b18a1a5afdb1a559231f8d10b4d))
* write version files and changelogs with tallyrelease version ([#33](https://github.com/abinnovision/tally-release/issues/33)) ([5961ce0](https://github.com/abinnovision/tally-release/commit/5961ce0c56b7ddbb4bff2cf154d5b5556212e8cb))


### Bug Fixes

* **cli:** do not log expected 404 responses ([#43](https://github.com/abinnovision/tally-release/issues/43)) ([58b7461](https://github.com/abinnovision/tally-release/commit/58b74615123ce5b960f2022baf0e7a08014be777))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @tallyrelease/core bumped to 0.3.0

## [0.2.0](https://github.com/abinnovision/tally-release/compare/cli-v0.1.1...cli-v0.2.0) (2026-10-15)


### Features

* add fixed groups ([#23](https://github.com/abinnovision/tally-release/issues/23)) ([9822ded](https://github.com/abinnovision/tally-release/commit/9822dedcb572b852348e7df3577d101bf4d70e62))
* **cli:** add plan --summary for GitHub step summaries ([#28](https://github.com/abinnovision/tally-release/issues/28)) ([7f6f156](https://github.com/abinnovision/tally-release/commit/7f6f156b291ed138a5dc170fc2a48dc332702e7a))
* **cli:** add plan and explain commands ([#20](https://github.com/abinnovision/tally-release/issues/20)) ([4a68ff1](https://github.com/abinnovision/tally-release/commit/4a68ff10092b44fb994fd62f86a51b7af4bdbd5f))
* **cli:** add shadow comparison against release-please ([#21](https://github.com/abinnovision/tally-release/issues/21)) ([2623aae](https://github.com/abinnovision/tally-release/commit/2623aaee6e8e653218f5623658e25fa97de62176))
* **core:** absorb internal changes as patch by default ([#22](https://github.com/abinnovision/tally-release/issues/22)) ([947b85f](https://github.com/abinnovision/tally-release/commit/947b85fd442ca650f0a47ee2349ffe41b9ea5b69))
* **core:** compute release versions with computePlan ([#18](https://github.com/abinnovision/tally-release/issues/18)) ([0341c3e](https://github.com/abinnovision/tally-release/commit/0341c3eea127abf32c1eda59344481a3ee506e84))
* **core:** match unit tags and collect plan facts ([#17](https://github.com/abinnovision/tally-release/issues/17)) ([828f9bd](https://github.com/abinnovision/tally-release/commit/828f9bd427b6e69419bdbb00d6570edee0cd9e0e))
* enforce maintenance branch limits ([#24](https://github.com/abinnovision/tally-release/issues/24)) ([c5e382b](https://github.com/abinnovision/tally-release/commit/c5e382bb1d58430555b85d8076659272353c1e30))


### Bug Fixes

* **cli:** fail on unreadable git blobs instead of treating them as absent ([#29](https://github.com/abinnovision/tally-release/issues/29)) ([1b5cad9](https://github.com/abinnovision/tally-release/commit/1b5cad9026c99fd687f60aecadf3e5cf69c9a47e))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @tallyrelease/core bumped to 0.2.0

## [0.1.1](https://github.com/abinnovision/tally-release/compare/cli-v0.1.0...cli-v0.1.1) (2026-10-15)


### Bug Fixes

* add unit tags and an affected --tag filter ([#14](https://github.com/abinnovision/tally-release/issues/14)) ([733e556](https://github.com/abinnovision/tally-release/commit/733e55642dc582e24e06d2e2b118110547ace742))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @tallyrelease/core bumped to 0.1.1

## 0.1.0 (2026-10-15)


### Features

* bootstrap tallyrelease with build selection (v0.1) ([#1](https://github.com/abinnovision/tally-release/issues/1)) ([4efde72](https://github.com/abinnovision/tally-release/commit/4efde72e32091df3c84a2b497272a3a0efdac659))
* **cli:** align human-readable output and add a local build base ([#8](https://github.com/abinnovision/tally-release/issues/8)) ([96cb5f0](https://github.com/abinnovision/tally-release/commit/96cb5f010f3090806da4317a50c23ba17884c5c5))
* **cli:** publish the tallyrelease.yaml JSON schema ([#9](https://github.com/abinnovision/tally-release/issues/9)) ([c5b5c94](https://github.com/abinnovision/tally-release/commit/c5b5c946315fdcab2a486cfc2eeef5dd47b6a8f8))
* **cli:** render the unit graph as mermaid ([#7](https://github.com/abinnovision/tally-release/issues/7)) ([297413a](https://github.com/abinnovision/tally-release/commit/297413a06534b803c5e98e3ee84cb8921bdebdd6))
* make units build-only unless opted into release ([#6](https://github.com/abinnovision/tally-release/issues/6)) ([4b01768](https://github.com/abinnovision/tally-release/commit/4b0176809d38504eec22e35168f57ca17840ef13))


### Bug Fixes

* **cli:** clearer errors and package docs for the 0.1.0 release ([#11](https://github.com/abinnovision/tally-release/issues/11)) ([85fc7ed](https://github.com/abinnovision/tally-release/commit/85fc7ed70693bae01c9b90319d808f72f5eef6f6))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @tallyrelease/core bumped to 0.1.0
