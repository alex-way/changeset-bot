// You can import your modules
// import index from '../src/index'

// Requiring our fixtures
//import payload from "./fixtures/issues.opened.json" with { "type": "json"};
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import nock from "nock";
import { Probot, ProbotOctokit } from "probot";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
// Requiring our app implementation
import myProbotApp from "../src/index.js";

const issueCreatedBody = { body: "Thanks for opening this issue!" };

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const privateKey = fs.readFileSync(
	path.join(__dirname, "fixtures/mock-cert.pem"),
	"utf-8",
);

const payload = JSON.parse(
	fs.readFileSync(path.join(__dirname, "fixtures/issues.opened.json"), "utf-8"),
);

describe("My Probot app", () => {
	let probot: any;

	beforeEach(() => {
		nock.disableNetConnect();
		probot = new Probot({
			appId: 123,
			privateKey,
			// disable request throttling and retries for testing
			Octokit: ProbotOctokit.defaults({
				retry: { enabled: false },
				throttle: { enabled: false },
			}),
		});
		// Load our app into probot
		probot.load(myProbotApp);
	});

	test("creates a comment when an issue is opened", async () => {
		const mock = nock("https://api.github.com")
			// Test that we correctly return a test token
			.post("/app/installations/2/access_tokens")
			.reply(200, {
				token: "test",
				permissions: {
					issues: "write",
				},
			})

			// Test that a comment is posted
			.post("/repos/hiimbex/testing-things/issues/1/comments", (body: any) => {
				expect(body).toMatchObject(issueCreatedBody);
				return true;
			})
			.reply(200);

		// Receive a webhook event
		await probot.receive({ name: "issues", payload });

		expect(mock.pendingMocks()).toStrictEqual([]);
	});

	afterEach(() => {
		nock.cleanAll();
		nock.enableNetConnect();
	});
});
