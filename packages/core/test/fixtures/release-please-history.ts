/** Commits release-please used for the 0.1.0 to 0.2.0 sections of this repo, newest first. */
export const history: Record<string, [sha: string, message: string][]> = {
	"cli@0.2.0": [
		[
			"1b5cad9026c99fd687f60aecadf3e5cf69c9a47e",
			"fix(cli): fail on unreadable git blobs instead of treating them as absent (#29)",
		],
		[
			"7f6f156b291ed138a5dc170fc2a48dc332702e7a",
			"feat(cli): add plan --summary for GitHub step summaries (#28)",
		],
		[
			"c5e382bb1d58430555b85d8076659272353c1e30",
			"feat: enforce maintenance branch limits (#24)",
		],
		[
			"9822dedcb572b852348e7df3577d101bf4d70e62",
			"feat: add fixed groups (#23)",
		],
		[
			"947b85fd442ca650f0a47ee2349ffe41b9ea5b69",
			"feat(core): absorb internal changes as patch by default (#22)",
		],
		[
			"2623aaee6e8e653218f5623658e25fa97de62176",
			"feat(cli): add shadow comparison against release-please (#21)",
		],
		[
			"4a68ff10092b44fb994fd62f86a51b7af4bdbd5f",
			"feat(cli): add plan and explain commands (#20)",
		],
		[
			"0341c3eea127abf32c1eda59344481a3ee506e84",
			"feat(core): compute release versions with computePlan (#18)",
		],
		[
			"828f9bd427b6e69419bdbb00d6570edee0cd9e0e",
			"feat(core): match unit tags and collect plan facts (#17)",
		],
	],
	"core@0.2.0": [
		[
			"c5e382bb1d58430555b85d8076659272353c1e30",
			"feat: enforce maintenance branch limits (#24)",
		],
		[
			"9822dedcb572b852348e7df3577d101bf4d70e62",
			"feat: add fixed groups (#23)",
		],
		[
			"947b85fd442ca650f0a47ee2349ffe41b9ea5b69",
			"feat(core): absorb internal changes as patch by default (#22)",
		],
		[
			"4a68ff10092b44fb994fd62f86a51b7af4bdbd5f",
			"feat(cli): add plan and explain commands (#20)",
		],
		[
			"bb987ba04fec52cea611cd0b8c9ed2e851fb0c9c",
			"feat(core): absorb unreleased dependencies and propagate releases (#19)",
		],
		[
			"0341c3eea127abf32c1eda59344481a3ee506e84",
			"feat(core): compute release versions with computePlan (#18)",
		],
		[
			"828f9bd427b6e69419bdbb00d6570edee0cd9e0e",
			"feat(core): match unit tags and collect plan facts (#17)",
		],
		[
			"2012c0ba035d551335f14ba709ec6db5d5ea1582",
			"feat(core): add semver scheme and conventional commit parser (#16)",
		],
	],
	"cli@0.1.1": [
		[
			"733e55642dc582e24e06d2e2b118110547ace742",
			"fix: add unit tags and an affected --tag filter (#14)",
		],
	],
	"core@0.1.1": [
		[
			"733e55642dc582e24e06d2e2b118110547ace742",
			"fix: add unit tags and an affected --tag filter (#14)",
		],
	],
	"cli@0.1.0": [
		[
			"3c4672b2317a8b3a379fb5cfe6317fd8650e00c2",
			"chore: exclude release-please changelogs from prettier (#13)",
		],
		[
			"f07170f54ccd56e52bf3befc6f5d1d01d59aa315",
			"build(deps): bump external dependencies to their latest versions (#12)",
		],
		[
			"85fc7ed70693bae01c9b90319d808f72f5eef6f6",
			"fix(cli): clearer errors and package docs for the 0.1.0 release (#11)",
		],
		[
			"c5b5c946315fdcab2a486cfc2eeef5dd47b6a8f8",
			"feat(cli): publish the tallyrelease.yaml JSON schema (#9)",
		],
		[
			"96cb5f010f3090806da4317a50c23ba17884c5c5",
			"feat(cli): align human-readable output and add a local build base (#8)",
		],
		[
			"297413a06534b803c5e98e3ee84cb8921bdebdd6",
			"feat(cli): render the unit graph as mermaid (#7)",
		],
		[
			"4b0176809d38504eec22e35168f57ca17840ef13",
			"feat: make units build-only unless opted into release (#6)",
		],
		[
			"32eddac3023748d09579d383930f4ff98e3cc486",
			"chore: prepare packages for npm publishing (#4)",
		],
		[
			"4efde72e32091df3c84a2b497272a3a0efdac659",
			"feat: bootstrap tallyrelease with build selection (v0.1) (#1)",
		],
	],
	"core@0.1.0": [
		[
			"3c4672b2317a8b3a379fb5cfe6317fd8650e00c2",
			"chore: exclude release-please changelogs from prettier (#13)",
		],
		[
			"f07170f54ccd56e52bf3befc6f5d1d01d59aa315",
			"build(deps): bump external dependencies to their latest versions (#12)",
		],
		[
			"85fc7ed70693bae01c9b90319d808f72f5eef6f6",
			"fix(cli): clearer errors and package docs for the 0.1.0 release (#11)",
		],
		[
			"96cb5f010f3090806da4317a50c23ba17884c5c5",
			"feat(cli): align human-readable output and add a local build base (#8)",
		],
		[
			"4b0176809d38504eec22e35168f57ca17840ef13",
			"feat: make units build-only unless opted into release (#6)",
		],
		[
			"32eddac3023748d09579d383930f4ff98e3cc486",
			"chore: prepare packages for npm publishing (#4)",
		],
		[
			"4efde72e32091df3c84a2b497272a3a0efdac659",
			"feat: bootstrap tallyrelease with build selection (v0.1) (#1)",
		],
	],
};
