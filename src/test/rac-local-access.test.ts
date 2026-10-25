import { afterEach, beforeEach, expect, test } from "bun:test";
import { chmod, mkdir, mkdtemp, realpath, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { LocalRacAccess, readOwnerDescriptor } from "../rac/local-access.ts";
import { RacStore } from "../rac/store.ts";
import { checkLocalRequest, readLocalJson } from "../server/local-policy.ts";

let base: string;
let root: string;
let dataRoot: string;
let store: RacStore;
let access: LocalRacAccess;
let now: number;
beforeEach(async () => {
	base = await realpath(await mkdtemp(join(tmpdir(), "rac-access-")));
	root = join(base, "project");
	dataRoot = join(base, "data");
	await mkdir(root);
	store = await RacStore.open(root, { dataRoot });
	now = 1000;
	access = new LocalRacAccess(
		store.owner,
		() => now,
		(value) => store.registerRedactionSecret(value),
	);
});
afterEach(async () => {
	await access.close();
	store.close();
	await rm(base, { recursive: true, force: true });
});
function cli() {
	return new Request("http://127.0.0.1:6421/api/rac/pair", {
		method: "POST",
		headers: {
			Authorization: `Bearer ${access.credential}`,
			"X-RAC-Project": store.owner.projectKey,
			"X-RAC-Owner": store.owner.generation,
		},
	});
}
test("private descriptor binds loopback owner and is removed on shutdown", async () => {
	await access.publish("http://127.0.0.1:6421/", dataRoot);
	const descriptor = await readOwnerDescriptor(root, dataRoot);
	expect(descriptor.secret).toBe(access.credential);
	expect(descriptor.generation).toBe(store.owner.generation);
	expect(access.authorize(cli(), true)).toBe("cli");
	await access.close();
	await expect(readOwnerDescriptor(root, dataRoot)).rejects.toThrow();
});
test("descriptor shared permissions or symlinks cannot be used by CLI", async () => {
	await access.publish("http://127.0.0.1:6421/", dataRoot);
	const path = join(dirname(store.path), "owner.json");
	await chmod(path, 0o644);
	await expect(readOwnerDescriptor(root, dataRoot)).rejects.toThrow();
	await chmod(path, 0o600);
	await rm(path);
	await symlink(store.path, path);
	await expect(readOwnerDescriptor(root, dataRoot)).rejects.toThrow();
});
test("one-use pairing yields an expiring project cookie and requires CSRF for mutations", () => {
	const pair = access.pair(access.issuePairing(cli()).code);
	const cookie = pair.cookie.split(";")[0] as string;
	expect(pair.cookie).toContain("HttpOnly; SameSite=Strict");
	const browser = (csrf?: string) =>
		new Request("http://127.0.0.1:6421/api/rac/runs", { headers: { cookie, ...(csrf ? { "X-RAC-CSRF": csrf } : {}) } });
	expect(access.authorize(browser())).toBe("browser");
	expect(() => access.authorize(browser(), true)).toThrow();
	expect(access.authorize(browser(pair.csrf), true)).toBe("browser");
	expect(() => access.pair("used")).toThrow();
	now += 8 * 60 * 60 * 1000;
	expect(() => access.authorize(browser())).toThrow();
});
test("pairing expiry/attempt bound and project/owner mismatch reject without a session", () => {
	const code = access.issuePairing(cli()).code;
	now += 120000;
	expect(() => access.pair(code)).toThrow();
	access.issuePairing(cli());
	for (let i = 0; i < 6; i++) expect(() => access.pair("wrong")).toThrow();
	const wrong = new Request(cli(), {
		headers: {
			Authorization: `Bearer ${access.credential}`,
			"X-RAC-Project": "other",
			"X-RAC-Owner": store.owner.generation,
		},
	});
	expect(() => access.authorize(wrong)).toThrow();
	const other = new LocalRacAccess({ ...store.owner, generation: "other" });
	expect(() => other.authorize(cli())).toThrow();
});
test("owner credentials, pair code, browser token and CSRF are redacted before persistence", () => {
	const code = access.issuePairing(cli()).code;
	const pair = access.pair(code);
	const cookieId = pair.cookie.split(";")[0]?.split("=")[1] as string;
	const session = store.createSession({ protocolVersion: "0.162.1" });
	const run = store.reserveRun({
		taskId: "TASK-1",
		taskCreatedAt: "2026-10-24",
		rawTask: "raw",
		sessionId: session.id,
	});
	store.appendEvent(run.id, { kind: "text", text: [access.credential, code, cookieId, pair.csrf].join(" ") });
	const persisted = JSON.stringify(store.listEvents(run.id));
	for (const value of [access.credential, code, cookieId, pair.csrf]) expect(persisted).not.toContain(value);
});
test("local request guard rejects rebinding, foreign/missing origins, non-JSON and cross-site streams", () => {
	const request = (headers: Record<string, string>, method = "GET") =>
		new Request("http://127.0.0.1:6421/board", { method, headers: { host: "127.0.0.1:6421", ...headers } });
	expect(() => checkLocalRequest(request({}), 6421)).not.toThrow();
	for (const headers of [
		{ host: "evil.test" },
		{ origin: "https://evil.test" },
		{ "sec-fetch-site": "cross-site" },
		{ upgrade: "websocket" },
		{ accept: "text/event-stream" },
	] as Record<string, string>[])
		expect(() => checkLocalRequest(request(headers), 6421)).toThrow();
	expect(() => checkLocalRequest(request({ "content-type": "application/json" }, "POST"), 6421)).toThrow();
	expect(() =>
		checkLocalRequest(request({ origin: "http://127.0.0.1:6421", "content-type": "text/plain" }, "POST"), 6421),
	).toThrow();
	expect(() =>
		checkLocalRequest(request({ origin: "http://127.0.0.1:6421", "content-type": "application/json" }, "POST"), 6421),
	).not.toThrow();
});
test("loopback policy normalizes the standard HTTP port and rejects a different listener", () => {
	const request = new Request("http://127.0.0.1/board", { headers: { host: "127.0.0.1" } });
	expect(() => checkLocalRequest(request, 80)).not.toThrow();
	expect(() => checkLocalRequest(request, 6421)).toThrow();
});

test("bounded JSON reader rejects arrays, malformed input and streamed oversize", async () => {
	for (const body of ["[]", "invalid", "x".repeat(300)])
		await expect(readLocalJson(new Request("http://localhost/", { method: "POST", body }), 256)).rejects.toThrow();
	expect(
		await readLocalJson(new Request("http://localhost/", { method: "POST", body: '{"taskId":"TASK-1"}' })),
	).toEqual({ taskId: "TASK-1" });
});
