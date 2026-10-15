import { gitReaderConformance, memoryGit } from "../src/testing.js";

gitReaderConformance((dag) => ({ git: memoryGit(dag), sha: (id) => id }));
