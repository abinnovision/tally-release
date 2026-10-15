import { createServer } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { githubForge } from "../../src/forge/github.js";

import type { IncomingHttpHeaders, Server } from "node:http";

describe("github forge", () => {
	const requests: { url: string; headers: IncomingHttpHeaders }[] = [];
	let server: Server;
	let baseUrl = "";

	beforeAll(async () => {
		server = createServer((req, res) => {
			requests.push({ url: req.url ?? "", headers: req.headers });
			const found = req.url?.startsWith(
				"/repos/acme/repo/actions/workflows/ci.yaml/",
			);
			const broken = req.url?.includes("/broken.yaml/");
			res.writeHead(found ? 200 : broken ? 502 : 404, {
				"content-type": "application/json",
			});
			res.end(
				JSON.stringify(
					found
						? {
								total_count: 2,
								workflow_runs: [{ head_sha: "b" }, { head_sha: "a" }],
							}
						: { message: "Not Found" },
				),
			);
		});
		await new Promise<void>((resolve) => {
			server.listen(0, "127.0.0.1", resolve);
		});
		const address = server.address();
		baseUrl = `http://127.0.0.1:${String(typeof address === "object" ? address?.port : "")}`;
	});

	afterAll(() => {
		server.close();
	});

	it("lists successful push runs via GITHUB_API_URL (G14)", async () => {
		const forge = githubForge({ token: "secret", baseUrl });
		const query = {
			owner: "acme",
			repo: "repo",
			workflow: "ci.yaml",
			branch: "main",
		};

		expect(await forge.lastSuccessfulPushRuns(query)).toEqual(["b", "a"]);
		const url = new URL(requests[0]?.url ?? "", baseUrl);
		expect(url.pathname).toBe(
			"/repos/acme/repo/actions/workflows/ci.yaml/runs",
		);
		expect(Object.fromEntries(url.searchParams)).toEqual({
			branch: "main",
			status: "success",
			event: "push",
			per_page: "100",
		});
		expect(requests[0]?.headers.authorization).toBe("token secret");

		expect(
			await forge.lastSuccessfulPushRuns({
				...query,
				workflow: "renamed.yaml",
			}),
		).toEqual([]);

		await expect(
			forge.lastSuccessfulPushRuns({ ...query, workflow: "broken.yaml" }),
		).rejects.toMatchObject({ status: 502 });
	});
});
