import { afterEach, beforeEach, expect, test } from "bun:test";
import { mkdir, mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LocalRacAccess } from "../rac/local-access.ts";
import { RacStore } from "../rac/store.ts";
import { checkLocalRequest, guardLocalRoutes, localError } from "../server/local-policy.ts";

let base: string;
let root: string;
let dataRoot: string;
let store: RacStore;
let clock: number;
beforeEach(async () => {
	base = await realpath(await mkdtemp(join(tmpdir(), "rac-review-test-")));
	root = join(base, "project");
	dataRoot = join(base, "data");
	await mkdir(root);
	clock = Date.now();
	store = await RacStore.open(root, { dataRoot, now: () => clock });
});
afterEach(async () => {
	store.close();
	await rm(base, { recursive: true, force: true });
});
function run() {
	const session = store.createSession({ threadId: "thread", protocolVersion: "0.162.1" });
	const result = store.reserveRun({
		taskId: "BACK-797",
		taskCreatedAt: "2026-10-25",
		rawTask: "raw",
		sessionId: session.id,
	});
	store.setRunStatus(result.id, "running");
	store.bindTurn(result.id, "turn");
	return result.id;
}
function request(path: string, method = "GET", headers: Record<string, string> = {}, body?: string) {
	return new Request(`http://127.0.0.1:6421${path}`, {
		method,
		headers: { host: "127.0.0.1:6421", ...headers },
		...(body === undefined ? {} : { body }),
	});
}

test("legacy non-browser clients work, while browser and all RAC mutations still require Origin", () => {
	expect(() =>
		checkLocalRequest(request("/api/tasks", "POST", { "content-type": "application/json" }, "{}"), 6421),
	).not.toThrow();
	for (const headers of [
		{ "sec-fetch-site": "same-origin" },
		{ cookie: "other=value" },
		{ origin: "null" },
		{ origin: "https://evil.test" },
	] as Record<string, string>[])
		expect(() =>
			checkLocalRequest(request("/api/tasks", "POST", { "content-type": "application/json", ...headers }, "{}"), 6421),
		).toThrow();
	expect(() =>
		checkLocalRequest(request("/api/rac/runs", "POST", { "content-type": "application/json" }, "{}"), 6421),
	).toThrow();
});
test("a non-browser fetch client with only Sec-Fetch-Mode stays compatible", () => {
	expect(() =>
		checkLocalRequest(
			request("/api/tasks", "POST", { "sec-fetch-mode": "cors", "content-type": "application/json" }, "{}"),
			6421,
		),
	).not.toThrow();
});
test("existing bodyless actions and plain-text editors work without admitting arbitrary text mutations", () => {
	for (const path of ["/api/milestones/m1/archive", "/api/drafts/TASK-1/promote"])
		expect(() => checkLocalRequest(request(path, "POST", { origin: "http://127.0.0.1:6421" }), 6421)).not.toThrow();
	for (const path of ["/api/decisions/decision-1"])
		expect(() =>
			checkLocalRequest(
				request(path, "PUT", { origin: "http://127.0.0.1:6421", "content-type": "text/plain" }, "document"),
				6421,
			),
		).not.toThrow();
	expect(() =>
		checkLocalRequest(
			request("/api/tasks", "POST", { origin: "http://127.0.0.1:6421", "content-type": "text/plain" }, "{}"),
			6421,
		),
	).toThrow();
	expect(() =>
		checkLocalRequest(request("/api/rac/runs", "POST", { origin: "http://127.0.0.1:6421" }), 6421),
	).toThrow();
});
test("cross-site document links work while cross-site fetches and mutations remain blocked", () => {
	const headers = { "sec-fetch-site": "cross-site", "sec-fetch-mode": "navigate", "sec-fetch-dest": "document" };
	expect(() => checkLocalRequest(request("/tasks/BACK-797", "GET", headers), 6421)).not.toThrow();
	expect(() => checkLocalRequest(request("/api/tasks", "GET", headers), 6421)).toThrow();
	expect(() => checkLocalRequest(request("/assets/untrusted.svg", "GET", headers), 6421)).toThrow();
	expect(() => checkLocalRequest(request("/tasks/BACK-797", "POST", headers, "{}"), 6421)).toThrow();
});
test("native route registration wraps function/response/method routes and rejects unsupported shapes", async () => {
	let calls = 0;
	const methodHandler = () => {
		calls++;
		return new Response("method");
	};
	const routes: Record<string, unknown> = {
		"/direct": () => {
			calls++;
			return new Response("direct");
		},
		"/static": new Response("static"),
		"/method": {
			GET: methodHandler,
		},
	};
	const guard = async (req: Request, action: () => Response | Promise<Response>) => {
		try {
			checkLocalRequest(req, 6421);
			return await action();
		} catch (error) {
			return localError(error);
		}
	};
	guardLocalRoutes(routes, {}, () => new Response("html"), guard);
	for (const path of ["/direct", "/static"]) {
		const handler = routes[path] as (req: Request) => Promise<Response>;
		expect((await handler(request(path, "GET", { host: "evil.test" }))).status).toBe(403);
		expect((await handler(request(path))).status).toBe(200);
	}
	const handler = (routes["/method"] as Record<string, (req: Request) => Promise<Response>>).GET;
	if (!handler) throw new Error("Method handler absent");
	expect((await handler(request("/method", "GET", { host: "evil.test" }))).status).toBe(403);
	expect(calls).toBe(1);
	for (const value of [{}, null, false, Bun.file("/tmp/not-a-route")])
		expect(() => guardLocalRoutes({ "/bad": value }, {}, () => new Response(), guard)).toThrow("Unsupported");
});
test("env assignments, credential URLs and PEM/PGP keys are redacted before SQLite persistence", () => {
	const id = run();
	const samples = [
		"DB_PASSWORD=private-db",
		"AWS_SECRET_ACCESS_KEY=private-aws",
		"DATABASE_URL=postgres://user:private-postgres@host/db",
		"redis://user:private-redis@host",
		"-----BEGIN PGP PRIVATE KEY BLOCK-----\nprivate-pgp\n-----END PGP PRIVATE KEY BLOCK-----",
		"-----BEGIN RSA PRIVATE KEY-----\nprivate-pem\n-----END RSA PRIVATE KEY-----",
	];
	store.appendEvent(id, { kind: "agent_message", text: samples.join("\n") });
	const json = JSON.stringify(store.listEvents(id));
	for (const secret of ["private-db", "private-aws", "private-postgres", "private-redis", "private-pgp", "private-pem"])
		expect(json).not.toContain(secret);
});
test("serialized text with quotes/newlines is bounded and records one truncation without fencing", () => {
	const id = run();
	const result = store.appendEvent(id, { kind: "agent_message", text: '"\n'.repeat(30000) });
	expect(result.truncated).toBe(true);
	expect(result.event?.kind).toBe("agent_message");
	for (const event of store.listEvents(id).events)
		expect(Buffer.byteLength(JSON.stringify(event.payload))).toBeLessThanOrEqual(65536);
	store.appendEvent(id, { kind: "text", text: "later" });
	store.setRunStatus(id, "completed");
	expect(
		store
			.listEvents(id)
			.events.some((event) => event.kind === "text" && (event.payload as { text?: string }).text === "later"),
	).toBe(true);
	expect(store.listEvents(id).events.filter((event) => event.kind === "truncated")).toHaveLength(1);
	expect(store.getRun(id).status).toBe("completed");
});
test("known secrets are redacted before truncation, including at the cut boundary", () => {
	const id = run();
	store.registerRedactionSecret("private-boundary-secret");
	store.appendEvent(id, {
		kind: "agent_message",
		text: ['"'.repeat(32740), "private-boundary-secret", "tail".repeat(1000)].join(""),
	});
	expect(JSON.stringify(store.listEvents(id))).not.toContain("private-boundary");
});
test("expired pairing/session secrets are retired without restarting the owner", () => {
	const access = new LocalRacAccess(
		store.owner,
		() => clock,
		(value, expires) => store.registerRedactionSecret(value, expires),
	);
	const req = new Request("http://127.0.0.1:6421/api/rac/pair", {
		headers: {
			authorization: `Bearer ${access.credential}`,
			"x-rac-project": store.owner.projectKey,
			"x-rac-owner": store.owner.generation,
		},
	});
	for (let index = 0; index < 600; index++) {
		const issued = access.issuePairing(req);
		access.pair(issued.code);
		clock += 8 * 60 * 60 * 1000 + 1;
	}
	const id = run();
	store.appendEvent(id, { kind: "text", text: access.credential });
	expect(JSON.stringify(store.listEvents(id))).not.toContain(access.credential);
});
test("terminal old-owner interactions are recovered and human-retired without changing run outcome", async () => {
	const id = run();
	store.createInteraction({
		id: "pending",
		runId: id,
		kind: "question",
		blocking: true,
		rpcRequestId: 0,
		threadId: "thread",
		turnId: "turn",
		expiresAt: clock + 1000,
	});
	store.setRunStatus(id, "failed");
	store.close();
	clock += 40 * 86400000;
	store = await RacStore.open(root, { dataRoot, now: () => clock });
	expect(store.listInteractions(id)[0]?.status).toBe("uncertain");
	expect(() => store.resolveRun(id, false)).toThrow();
	expect(store.pruneHistory()).toEqual([]);
	expect(store.resolveRun(id, true).status).toBe("failed");
	expect(store.listInteractions(id)[0]?.status).toBe("stale");
	expect(store.pruneHistory()).toEqual([id]);
});
test("the store rejects ambiguous bare task IDs instead of guessing its project prefix", () => {
	expect(() => store.listTaskRuns("797")).toThrow("fully qualified");
});

test("retiring a terminal interaction never clears a later turn in the same session", () => {
	const id = run();
	store.createInteraction({
		id: "old",
		runId: id,
		kind: "question",
		blocking: true,
		rpcRequestId: 0,
		threadId: "thread",
		turnId: "turn",
		expiresAt: clock + 1000,
	});
	store.setRunStatus(id, "failed");
	const sessionId = store.getRun(id).sessionId;
	const next = store.reserveRun({ taskId: "BACK-798", taskCreatedAt: "2026-10-25", rawTask: "next", sessionId });
	store.setRunStatus(next.id, "running");
	store.bindTurn(next.id, "turn-2");
	store.resolveRun(id, true);
	expect(store.getSession(sessionId)?.currentTurnId).toBe("turn-2");
	expect(store.listInteractions(id)[0]?.status).toBe("stale");
});
