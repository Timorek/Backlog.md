import { afterAll, beforeAll, expect, spyOn, test } from "bun:test";
import { mkdir, mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FileSystem } from "../file-system/operations.ts";
import { BacklogServer } from "../server/index.ts";

type Handler = (request: Request) => Promise<Response>;
let base: string;
let server: BacklogServer;
let filesystem: FileSystem;
let options: {
	routes: Record<string, Handler | Record<string, Handler>>;
	fetch: (request: Request, server: unknown) => Promise<Response>;
};
let upgrades = 0;
const native = {
	port: 6421,
	stop: async () => {},
	upgrade: () => {
		upgrades++;
		return false;
	},
};
beforeAll(async () => {
	base = await realpath(await mkdtemp(join(tmpdir(), "rac-entry-")));
	const root = join(base, "project");
	await mkdir(root);
	filesystem = new FileSystem(root);
	await filesystem.ensureBacklogStructure();
	await filesystem.saveConfig({
		projectName: "Entry fixture",
		statuses: ["To Do", "In Progress", "Done"],
		labels: [],
		milestones: [],
		dateFormat: "YYYY-MM-DD",
		autoCommit: false,
		remoteOperations: false,
		checkActiveBranches: false,
	});
	const serve = spyOn(Bun, "serve").mockImplementation((value: unknown) => {
		options = value as typeof options;
		return native as unknown as ReturnType<typeof Bun.serve>;
	});
	const logs = spyOn(console, "log").mockImplementation(() => {});
	try {
		server = new BacklogServer(root, { racDataRoot: join(base, "data") });
		await server.start(6421, false);
	} finally {
		serve.mockRestore();
		logs.mockRestore();
	}
});
afterAll(async () => {
	await server?.stop();
	await rm(base, { recursive: true, force: true });
});
function request(path: string, headers: Record<string, string> = {}, method = "GET", body?: string) {
	return new Request(`http://127.0.0.1:6421${path}`, {
		method,
		headers: { host: "127.0.0.1:6421", ...headers },
		...(body ? { body } : {}),
	});
}
function route(path: string, method = "GET"): Handler {
	const value = options.routes[path];
	if (typeof value === "function") return value;
	if (value?.[method]) return value[method];
	throw new Error("Missing fixture route");
}

test("actual configured HTML and generated asset handlers enforce Host and Origin", async () => {
	const html = route("/board");
	expect((await html(request("/board", { host: "evil.test" }))).status).toBe(403);
	const valid = await html(request("/board"));
	expect(valid.status).toBe(200);
	const text = await valid.text();
	expect(text).toContain('<div id="root">');
	const asset = text.match(/src="(\/[^" ]+\.js)"/)?.[1];
	expect(asset).toBeDefined();
	if (!asset) throw new Error("No bundle script");
	expect((await route(asset)(request(asset, { origin: "https://evil.test" }))).status).toBe(403);
	expect((await route(asset)(request(asset))).status).toBe(200);
	expect((await route(asset)(request(asset))).headers.get("cache-control")).toContain("immutable");
	expect(options.routes["/"]).toBeFunction();
});
test("native API handlers reject CSRF and text/plain before any task mutation", async () => {
	const create = route("/api/tasks", "POST");
	expect(
		(
			await create(
				request(
					"/api/tasks",
					{ "content-type": "application/json", "sec-fetch-site": "same-origin" },
					"POST",
					'{"title":"Injected"}',
				),
			)
		).status,
	).toBe(403);
	expect(
		(
			await create(
				request(
					"/api/tasks",
					{ origin: "http://127.0.0.1:6421", "content-type": "text/plain" },
					"POST",
					'{"title":"Injected"}',
				),
			)
		).status,
	).toBe(415);
	expect(await filesystem.listTasks()).toEqual([]);
	const response = await create(
		request(
			"/api/tasks",
			{ origin: "http://127.0.0.1:6421", "content-type": "application/json" },
			"POST",
			'{"title":"Authorized task"}',
		),
	);
	expect(response.status).toBe(201);
	expect(await filesystem.listTasks()).toHaveLength(1);
});
test("fallback rejects foreign WebSocket/SSE and unknown Host before upgrade", async () => {
	expect(
		(await options.fetch(request("/ws", { upgrade: "websocket", origin: "https://evil.test" }), native)).status,
	).toBe(403);
	expect((await options.fetch(request("/api/rac/future", { accept: "text/event-stream" }), native)).status).toBe(403);
	expect(upgrades).toBe(0);
	expect((await options.fetch(request("/unknown", { host: "evil.test" }), native)).status).toBe(403);
});

test("ordinary handler exceptions retain logged HTTP 500 semantics", async () => {
	const errors = spyOn(console, "error").mockImplementation(() => {});
	try {
		const internal = server as unknown as {
			guardIncoming(req: Request, port: number, action: () => Response): Promise<Response>;
		};
		const response = await internal.guardIncoming(request("/api/tasks"), 6421, () => {
			throw new Error("Fixture handler failure");
		});
		expect(response.status).toBe(500);
		expect(await response.text()).not.toContain("RAC");
		expect(errors).toHaveBeenCalledTimes(1);
	} finally {
		errors.mockRestore();
	}
});

test("legacy local clients and the three reviewed dashboard actions reach their existing handlers", async () => {
	const create = await route(
		"/api/tasks",
		"POST",
	)(request("/api/tasks", { "content-type": "application/json" }, "POST", '{"title":"Legacy local client"}'));
	expect(create.status).toBe(201);
	const decisionResponse = await route(
		"/api/decisions",
		"POST",
	)(request("/api/decisions", { "content-type": "application/json" }, "POST", '{"title":"Review decision"}'));
	const decision = (await decisionResponse.json()) as { id: string };
	for (const type of ["text/plain", "text/markdown", undefined]) {
		const req = Object.assign(
			request(
				`/api/decisions/${decision.id}`,
				{ origin: "http://127.0.0.1:6421", ...(type ? { "content-type": type } : {}) },
				"PUT",
				"## Context\n\nReviewed editor\n\n## Decision\n\nKeep existing API\n",
			),
			{ params: { id: decision.id } },
		);
		expect((await route("/api/decisions/:id", "PUT")(req)).status).toBe(200);
	}
	const milestoneResponse = await route(
		"/api/milestones",
		"POST",
	)(request("/api/milestones", { "content-type": "application/json" }, "POST", '{"title":"Review milestone"}'));
	const milestone = (await milestoneResponse.json()) as { id: string };
	const archive = Object.assign(
		request(`/api/milestones/${milestone.id}/archive`, { origin: "http://127.0.0.1:6421" }, "POST"),
		{ params: { id: milestone.id } },
	);
	expect((await route("/api/milestones/:id/archive", "POST")(archive)).status).toBe(200);
	await filesystem.saveDraft({
		id: "DRAFT-1",
		title: "Review draft",
		status: "Draft",
		assignee: [],
		createdDate: "2026-10-25",
		labels: [],
		dependencies: [],
	});
	const promote = Object.assign(request("/api/drafts/DRAFT-1/promote", { origin: "http://127.0.0.1:6421" }, "POST"), {
		params: { id: "DRAFT-1" },
	});
	expect((await route("/api/drafts/:id/promote", "POST")(promote)).status).toBe(200);
});

test("authorized root upgrades dispatch before HTML while foreign origins never reach upgrade", async () => {
	const before = upgrades;
	const rejected = await route("/")(request("/", { upgrade: "websocket", origin: "https://evil.test" }));
	expect(rejected.status).toBe(403);
	expect(upgrades).toBe(before);
	const failed = await route("/")(request("/", { upgrade: "websocket", origin: "http://127.0.0.1:6421" }));
	expect(failed.status).toBe(400);
	expect(upgrades).toBe(before + 1);
	const success = spyOn(native, "upgrade").mockReturnValue(true);
	try {
		const response = await route("/")(request("/", { upgrade: "WebSocket", origin: "http://127.0.0.1:6421" }));
		expect(response.status).toBe(101);
		expect(await response.text()).toBe("");
	} finally {
		success.mockRestore();
	}
});
