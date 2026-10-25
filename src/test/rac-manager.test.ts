import { afterEach, beforeEach, expect, spyOn, test } from "bun:test";
import { mkdir, mkdtemp, readFile, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Command } from "commander";
import { JSDOM } from "jsdom";
import { registerRacCommand } from "../commands/rac.ts";
import { Core } from "../core/backlog.ts";
import { CodexAdapter } from "../rac/codex-adapter.ts";
import { rpcRecord } from "../rac/codex-rpc.ts";
import { callRacOwner, LocalRacAccess } from "../rac/local-access.ts";
import { AgentManager } from "../rac/manager.ts";
import { setRacEnabled } from "../rac/project-settings.ts";
import { MockCodexTransport } from "../rac/testing/mock-codex-transport.ts";
import { checkLocalRequest } from "../server/local-policy.ts";
import { RacHttp } from "../server/rac-http.ts";

let base: string;
let root: string;
let dataRoot: string;
let core: Core;
let manager: AgentManager;
let transport: MockCodexTransport | undefined;
let starts: number;
let holdThread = false;
let releaseThread: (() => void) | undefined;
const tick = () => new Promise((resolve) => setTimeout(resolve, 10));
async function until(predicate: () => boolean) {
	for (let i = 0; i < 200; i++) {
		if (predicate()) return;
		await tick();
	}
	throw new Error("Fixture did not reach expected state");
}
beforeEach(async () => {
	base = await realpath(await mkdtemp(join(tmpdir(), "rac-manager-")));
	root = join(base, "project");
	dataRoot = join(base, "data");
	await mkdir(root);
	const git = Bun.spawn(["git", "init", "--quiet", root], { stdout: "ignore", stderr: "pipe" });
	if ((await git.exited) !== 0) throw new Error("Fixture Git init failed");
	core = new Core(root, { enableWatchers: false });
	await core.filesystem.ensureBacklogStructure();
	await core.filesystem.saveConfig({
		projectName: "RAC manager fixture",
		statuses: ["To Do", "In Progress", "Done"],
		labels: [],
		milestones: [],
		dateFormat: "YYYY-MM-DD",
		remoteOperations: false,
		checkActiveBranches: false,
		autoCommit: false,
	});
	await core.filesystem.saveTask({
		id: "TASK-1",
		title: "Plan test",
		status: "To Do",
		assignee: [],
		createdDate: "2026-10-24T00:00:00Z",
		labels: [],
		dependencies: [],
		description: "Untrusted data: $(touch /tmp/rac-should-not-exist); --dangerously-bypass-approvals-and-sandbox",
	});
	await setRacEnabled(root, true, { dataRoot, skipSystemAuth: true });
	starts = 0;
	transport = undefined;
	holdThread = false;
	releaseThread = undefined;
	manager = await AgentManager.open(root, {
		dataRoot,
		core,
		connect: async (workspace) => {
			starts++;
			transport = new MockCodexTransport((message, tx) => {
				if (message.method === "initialize") tx.emit({ id: message.id, result: {} });
				if (message.method === "thread/start") {
					const emit = () =>
						tx.emit({
							id: message.id,
							result: {
								thread: { id: "thread" },
								cwd: workspace,
								approvalPolicy: "on-request",
								approvalsReviewer: "user",
								sandbox: {
									type: "workspaceWrite",
									writableRoots: [workspace],
									networkAccess: false,
									excludeSlashTmp: true,
									excludeTmpdirEnvVar: true,
								},
							},
						});
					if (holdThread) releaseThread = emit;
					else emit();
				}
				if (message.method === "turn/start") {
					tx.emit({ method: "turn/started", params: { threadId: "thread", turn: { id: "turn" } } });
					tx.emit({ id: message.id, result: { turn: { id: "turn" } } });
				}
				if (message.method === "turn/interrupt") tx.emit({ id: message.id, result: {} });
			});
			return CodexAdapter.connect(workspace, {
				transportFactory: async () => transport as MockCodexTransport,
				timeoutMs: 100,
			});
		},
	});
});
afterEach(async () => {
	await manager?.close();
	core.disposeContentStore();
	core.disposeSearchService();
	await rm(base, { recursive: true, force: true });
});
async function body() {
	return { taskId: "task-1", expectedTaskRevision: (await manager.taskHistory("TASK-1")).taskRevision };
}
async function run() {
	const result = await manager.start(await body(), "start-key");
	await until(() => transport?.messages.some((message) => message.method === "turn/start") ?? false);
	return (result.result as { runId: string }).runId;
}

test("one reservation launches a planning turn and never mutates task status or assignee", async () => {
	const before = await core.filesystem.loadTask("TASK-1");
	const content = await readFile(before?.filePath as string, "utf8");
	const id = await run();
	expect((await manager.status(id)).run.status).toBe("running");
	const messages = transport?.messages ?? [];
	expect(
		rpcRecord(messages.find((message) => message.method === "thread/start")?.params).developerInstructions,
	).toContain("Do not implement");
	const input = rpcRecord(messages.find((message) => message.method === "turn/start")?.params).input;
	expect(JSON.stringify(input)).toContain("$(touch /tmp/rac-should-not-exist)");
	expect(rpcRecord(messages.find((message) => message.method === "turn/start")?.params).approvalPolicy).toBe(
		"on-request",
	);
	expect(await readFile(before?.filePath as string, "utf8")).toBe(content);
	expect((await manager.status(id)).implementationAvailable).toBe(false);
	transport?.emit({
		method: "item/completed",
		params: { threadId: "thread", turnId: "turn", item: { type: "agentMessage", text: "Plan ready for review" } },
	});
	transport?.emit({
		method: "turn/completed",
		params: { threadId: "thread", turn: { id: "turn", status: "completed" } },
	});
	await until(() => manager.store.getRun(id).status === "completed");
	expect(manager.store.listEvents(id).events.some((event) => event.kind === "agent_message")).toBe(true);
	expect((await core.filesystem.loadTask("TASK-1"))?.status).toBe("To Do");
});

test("concurrent identical clicks replay once; changed task does not invalidate a committed retry", async () => {
	const input = await body();
	const results = await Promise.all([manager.start(input, "same"), manager.start(input, "same")]);
	expect(results.filter((result) => result.replayed)).toHaveLength(1);
	expect(results[0]?.result).toEqual(results[1]?.result);
	await until(() => starts === 1);
	const task = await core.filesystem.loadTask("TASK-1");
	if (!task) throw new Error("Fixture task absent");
	task.description = "Changed after admission";
	await core.filesystem.saveTask(task);
	expect((await manager.start(input, "same")).replayed).toBe(true);
	expect(starts).toBe(1);
	await expect(manager.start({ ...input, expectedTaskRevision: "0".repeat(64) }, "same")).rejects.toMatchObject({
		code: "idempotency_conflict",
	});
});

test("busy slot returns 409 and no second reservation or session", async () => {
	await run();
	await expect(manager.start(await body(), "other")).rejects.toMatchObject({ code: "run_active", status: 409 });
	expect(manager.store.listTaskRuns("TASK-1")).toHaveLength(1);
	expect(starts).toBe(1);
});

test("unknown task, stale revision and injected execution options fail before launch", async () => {
	const input = await body();
	await expect(manager.start({ ...input, taskId: "TASK-999" }, "missing")).rejects.toMatchObject({ status: 404 });
	await expect(manager.start({ ...input, expectedTaskRevision: "0".repeat(64) }, "old")).rejects.toMatchObject({
		code: "task_revision_conflict",
	});
	for (const field of ["args", "cwd", "projectId", "approvalPolicy", "phase", "model"])
		await expect(manager.start({ ...input, [field]: "untrusted" }, field)).rejects.toMatchObject({ status: 400 });
	expect(starts).toBe(0);
	expect(manager.store.listTaskRuns("TASK-1")).toEqual([]);
});

test("blocked and completed tasks and active Git operations refuse admission", async () => {
	const task = await core.filesystem.loadTask("TASK-1");
	if (!task) throw new Error("Missing fixture task");
	task.dependencies = ["TASK-999"];
	await core.filesystem.saveTask(task);
	await expect(manager.start(await body(), "blocked")).rejects.toMatchObject({ code: "task_not_ready" });
	task.dependencies = [];
	task.status = "Done";
	await core.filesystem.saveTask(task);
	await expect(manager.start(await body(), "done")).rejects.toMatchObject({ code: "task_not_ready" });
	task.status = "To Do";
	await core.filesystem.saveTask(task);
	await Bun.write(join(root, ".git", "MERGE_HEAD"), "synthetic");
	await expect(manager.start(await body(), "merge")).rejects.toMatchObject({ code: "git_operation_active" });
	expect(starts).toBe(0);
});

test("unsupported human question interrupts the planning run without an implementation turn", async () => {
	const id = await run();
	transport?.emit({
		id: 0,
		method: "item/tool/requestUserInput",
		params: { threadId: "thread", turnId: "turn", isBlocking: true, questions: [] },
	});
	await until(() => manager.store.getRun(id).status === "interrupted");
	expect(transport?.messages.filter((message) => message.method === "turn/start")).toHaveLength(1);
});

test("shutdown stops the adapter before releasing ownership", async () => {
	const id = await run();
	await manager.close();
	const second = await AgentManager.open(root, { dataRoot, core });
	try {
		expect(second.store.getRun(id).status).toBe("interrupted");
	} finally {
		await second.close();
	}
});

test("CLI start/status use the authenticated API and the same reservation without an extra owner", async () => {
	const access = new LocalRacAccess(manager.store.owner);
	await access.publish("http://127.0.0.1:6421/", dataRoot);
	const http = new RacHttp(manager, access);
	const network = spyOn(globalThis, "fetch").mockImplementation(
		Object.assign(
			async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
				const req = new Request(input, init);
				req.headers.set("host", new URL(req.url).host);
				checkLocalRequest(req, 6421);
				return (await http.handle(req)) ?? new Response(null, { status: 404 });
			},
			{ preconnect: globalThis.fetch.preconnect },
		),
	);
	const logs: string[] = [];
	const output = spyOn(console, "log").mockImplementation((value) => logs.push(String(value)));
	const errors = spyOn(console, "error").mockImplementation(() => {});
	try {
		const cli = new Command().exitOverride();
		registerRacCommand(
			cli,
			async () => root,
			undefined,
			(project, path, options) => callRacOwner(project, path, { ...options, dataRoot }),
		);
		await cli.parseAsync(["rac", "start", "TASK-1", "--idempotency-key", "cli-key"], { from: "user" });
		const start = JSON.parse(logs[0] as string);
		expect(start.schemaVersion).toBe(1);
		expect(start.projectKey).toBe(manager.store.owner.projectKey);
		await cli.parseAsync(["rac", "status", start.result.runId], { from: "user" });
		expect(JSON.parse(logs[1] as string).run.id).toBe(start.result.runId);
		expect(manager.store.listTaskRuns("TASK-1")).toHaveLength(1);
	} finally {
		network.mockRestore();
		output.mockRestore();
		errors.mockRestore();
		await access.close();
	}
});

test("paired browser requires CSRF to start and has no implementation or answer route", async () => {
	const access = new LocalRacAccess(manager.store.owner);
	const http = new RacHttp(manager, access);
	const cli = new Request("http://127.0.0.1:6421/api/rac/pair", {
		headers: {
			authorization: `Bearer ${access.credential}`,
			"x-rac-project": manager.store.owner.projectKey,
			"x-rac-owner": manager.store.owner.generation,
		},
	});
	const code = access.issuePairing(cli).code;
	const pair = await http.handle(
		new Request("http://127.0.0.1:6421/api/rac/session", { method: "POST", body: JSON.stringify({ code }) }),
	);
	const session = (await pair?.json()) as { csrf: string };
	const cookie = pair?.headers.get("set-cookie")?.split(";")[0] as string;
	const bootstrap = await http.handle(new Request("http://127.0.0.1:6421/api/rac/session", { headers: { cookie } }));
	if (!bootstrap) throw new Error("Missing session bootstrap");
	expect(((await bootstrap.json()) as { csrf: string }).csrf).toBe(session.csrf);
	const request = async (csrf?: string) =>
		new Request("http://127.0.0.1:6421/api/rac/runs", {
			method: "POST",
			headers: { cookie, "idempotency-key": "browser-key", ...(csrf ? { "x-rac-csrf": csrf } : {}) },
			body: JSON.stringify(await body()),
		});
	expect((await http.handle(await request()))?.status).toBe(403);
	expect(starts).toBe(0);
	expect((await http.handle(await request(session.csrf)))?.status).toBe(202);
	for (const operation of ["resume", "messages", "answer", "decision"]) {
		const denied = await http.handle(
			new Request(`http://127.0.0.1:6421/api/rac/runs/anything/${operation}`, {
				method: "POST",
				headers: { cookie, "x-rac-csrf": session.csrf },
			}),
		);
		expect(denied?.status).toBe(404);
	}
	await access.close();
});

test("pairing form submits the one-use code and displays success without exposing the credential", async () => {
	const access = new LocalRacAccess(manager.store.owner);
	const http = new RacHttp(manager, access);
	const cli = new Request("http://127.0.0.1:6421/api/rac/pair", {
		headers: {
			authorization: `Bearer ${access.credential}`,
			"x-rac-project": manager.store.owner.projectKey,
			"x-rac-owner": manager.store.owner.generation,
		},
	});
	const code = access.issuePairing(cli).code;
	const page = await http.handle(new Request("http://127.0.0.1:6421/rac/pair"));
	if (!page) throw new Error("Pair page absent");
	const html = await page.text();
	expect(html).not.toContain(access.credential);
	const dom = new JSDOM(html, {
		url: "http://127.0.0.1:6421/rac/pair",
		runScripts: "dangerously",
		beforeParse(window) {
			window.fetch = async (input, init) =>
				(await http.handle(new Request(new URL(String(input), window.location.href), init))) ??
				new Response(null, { status: 404 });
		},
	});
	try {
		const input = dom.window.document.querySelector("input");
		const form = dom.window.document.querySelector("form");
		if (!input || !form) throw new Error("Pair form absent");
		input.value = code;
		form.dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true }));
		await until(() => dom.window.document.querySelector("[role=status]")?.textContent === "RAC paired.");
		expect(dom.window.document.querySelector("form")).toBeNull();
	} finally {
		dom.window.close();
		await access.close();
	}
});

test("numeric routes and starts honor a custom project prefix", async () => {
	const config = await core.filesystem.loadConfig();
	if (!config) throw new Error("Missing fixture config");
	await core.filesystem.saveConfig({ ...config, prefixes: { task: "back" } });
	await core.filesystem.saveTask({
		id: "BACK-797",
		title: "Custom prefix",
		status: "To Do",
		assignee: [],
		createdDate: "2026-10-25",
		labels: [],
		dependencies: [],
	});
	const revision = (await manager.taskHistory("797")).taskRevision;
	const started = await manager.start({ taskId: "797", expectedTaskRevision: revision }, "numeric");
	const id = (started.result as { runId: string }).runId;
	expect(manager.store.getRun(id).taskId).toBe("BACK-797");
	expect((await manager.taskHistory("797")).runs).toHaveLength(1);
});
test("a non-Git project can plan a task", async () => {
	await rm(join(root, ".git"), { recursive: true, force: true });
	const id = await run();
	expect(manager.store.getRun(id).status).toBe("running");
});

test("filesystem-only task configuration cannot bypass an actual Git operation", async () => {
	const config = await core.filesystem.loadConfig();
	if (!config) throw new Error("No fixture config");
	await core.filesystem.saveConfig({ ...config, filesystemOnly: true });
	await Bun.write(join(root, ".git", "MERGE_HEAD"), "synthetic");
	await expect(manager.start(await body(), "filesystem-merge")).rejects.toMatchObject({ code: "git_operation_active" });
	expect(starts).toBe(0);
});
test("cancel-only approvals are denied with an offered decision and release the slot after cleanup", async () => {
	const id = await run();
	transport?.emit({
		id: 0,
		method: "item/commandExecution/requestApproval",
		params: { threadId: "thread", turnId: "turn", availableDecisions: ["cancel"] },
	});
	await until(() => manager.store.getRun(id).status === "interrupted");
	expect(
		transport?.messages.some((message) => message.id === 0 && rpcRecord(message.result).decision === "cancel"),
	).toBe(true);
});
test("disabling RAC stops the verified owned group without leaving an unknown slot", async () => {
	const id = await run();
	await setRacEnabled(root, false, { dataRoot, skipSystemAuth: true });
	await until(() => manager.store.getRun(id).status === "interrupted");
	await setRacEnabled(root, true, { dataRoot, skipSystemAuth: true });
	expect((await manager.status(id)).run.status).toBe("interrupted");
});
test("unverified cleanup remains unknown until authenticated, idempotent human resolution", async () => {
	const id = await run();
	if (!transport) throw new Error("No fixture transport");
	const close = transport.close.bind(transport);
	transport.close = async () => ({ ...(await close()), groupStopped: false });
	transport.crash();
	await until(() => manager.store.getRun(id).status === "unknown");
	await expect(manager.resolve(id, { previousProcessStopped: false }, "resolve")).rejects.toMatchObject({
		status: 400,
	});
	const access = new LocalRacAccess(manager.store.owner);
	await access.publish("http://127.0.0.1:6421/", dataRoot);
	const http = new RacHttp(manager, access);
	const network = spyOn(globalThis, "fetch").mockImplementation(
		Object.assign(
			async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
				const req = new Request(input, init);
				req.headers.set("host", new URL(req.url).host);
				checkLocalRequest(req, 6421);
				return (await http.handle(req)) ?? new Response(null, { status: 404 });
			},
			{ preconnect: globalThis.fetch.preconnect },
		),
	);
	const logs: string[] = [];
	const output = spyOn(console, "log").mockImplementation((value) => logs.push(String(value)));
	const errors = spyOn(console, "error").mockImplementation(() => {});
	try {
		const cli = new Command().exitOverride().configureOutput({ writeErr: () => {} });
		registerRacCommand(
			cli,
			async () => root,
			undefined,
			(project, path, options) => callRacOwner(project, path, { ...options, dataRoot }),
		);
		await expect(cli.parseAsync(["rac", "resolve", id], { from: "user" })).rejects.toThrow();
		await cli.parseAsync(["rac", "resolve", id, "--confirm-process-stopped", "--idempotency-key", "resolution"], {
			from: "user",
		});
		expect(JSON.parse(logs[0] as string).result.status).toBe("abandoned");
		expect((await manager.resolve(id, { previousProcessStopped: true }, "resolution")).replayed).toBe(true);
		expect(manager.store.getRun(id).status).toBe("abandoned");
	} finally {
		network.mockRestore();
		output.mockRestore();
		errors.mockRestore();
		await access.close();
	}
});
test("resolution cannot retire a live owned run or fence the healthy owner", async () => {
	const id = await run();
	await expect(manager.resolve(id, { previousProcessStopped: true }, "live")).rejects.toMatchObject({
		code: "cleanup_pending",
	});
	expect((await manager.status(id)).run.status).toBe("running");
});
test("closing during thread startup records verified interruption", async () => {
	holdThread = true;
	const started = await manager.start(await body(), "closing");
	const id = (started.result as { runId: string }).runId;
	await until(() => Boolean(releaseThread));
	const closing = manager.close();
	if (!releaseThread) throw new Error("Thread response absent");
	releaseThread();
	await closing;
	const reopened = await AgentManager.open(root, { dataRoot, core });
	try {
		expect(reopened.store.getRun(id).status).toBe("interrupted");
	} finally {
		await reopened.close();
	}
});
test("RPC timeout followed by verified group cleanup releases the slot", async () => {
	holdThread = true;
	const started = await manager.start(await body(), "timeout");
	const id = (started.result as { runId: string }).runId;
	await until(() => manager.store.getRun(id).status === "interrupted");
	expect(manager.store.getRun(id).status).toBe("interrupted");
});
