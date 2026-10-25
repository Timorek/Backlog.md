import { mkdir, mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { FileSystem } from "../../src/file-system/operations.ts";
import { CodexAdapter } from "../../src/rac/codex-adapter.ts";
import { rpcRecord } from "../../src/rac/codex-rpc.ts";
import { callRacOwner, readOwnerDescriptor } from "../../src/rac/local-access.ts";
import { setRacEnabled } from "../../src/rac/project-settings.ts";
import { MockCodexTransport } from "../../src/rac/testing/mock-codex-transport.ts";
import { BacklogServer } from "../../src/server/index.ts";

const live = process.argv.includes("--live");
if (process.argv.slice(2).some((arg) => arg !== "--live"))
	throw new Error("Usage: bun scripts/rac/rac-api-smoke.ts [--live]");
try {
	const listener = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => new Response("preflight") });
	await listener.stop();
} catch {
	console.log(
		JSON.stringify(
			{ kind: "rac08-http-smoke", liveRequested: live, ok: false, error: "listener_unavailable" },
			null,
			2,
		),
	);
	process.exit(1);
}
const base = await realpath(await mkdtemp(join(tmpdir(), "rac08-http-")));
const root = join(base, "project");
const dataRoot = join(base, "data");
await mkdir(root);
const filesystem = new FileSystem(root);
let server: BacklogServer | undefined;
const result: Record<string, unknown> = { kind: "rac08-http-smoke", liveRequested: live };
let exitCode = 0;
const requireStatus = async (response: Response, status: number) => {
	if (response.status !== status) throw new Error(`HTTP verification expected ${status}, received ${response.status}`);
	return response;
};
try {
	const git = Bun.spawn(["git", "init", "--quiet", root], { stdout: "ignore", stderr: "ignore" });
	if ((await git.exited) !== 0) throw new Error("Temporary Git fixture could not be initialized");
	await filesystem.ensureBacklogStructure();
	await filesystem.saveConfig({
		projectName: "RAC-08 temporary smoke",
		statuses: ["To Do", "In Progress", "Done"],
		labels: [],
		milestones: [],
		dateFormat: "YYYY-MM-DD",
		autoCommit: false,
		remoteOperations: false,
		checkActiveBranches: false,
	});
	const sourceCli = fileURLToPath(new URL("../../src/cli.ts", import.meta.url));
	const quote = (text: string) => `'${text.replaceAll("'", "'\\''")}'`;
	await Bun.write(
		join(root, "AGENTS.md"),
		`This is an isolated planning probe. Use ${quote(process.execPath)} ${quote(sourceCli)} as the backlog CLI from this workspace. Read backlog instructions overview and task-execution. Prepare only the Implementation Plan for TASK-1 using task edit --plan, then stop. Do not implement, mark Done, commit, push, read secrets or request additional permissions. The user has authorized the planning probe only.\n`,
	);
	await Bun.write(
		join(root, "MANIFESTO.md"),
		"Tasks are Markdown. Prepare a plan, request human review, and stop before implementation.\n",
	);
	await filesystem.saveTask({
		id: "TASK-1",
		title: "Plan a short greeting document",
		status: "To Do",
		assignee: [],
		createdDate: "2026-10-25T00:00:00Z",
		labels: [],
		dependencies: [],
		description:
			"Prepare and save a two-step Implementation Plan for a future GREETING.md containing Hello. Do not create GREETING.md yet.",
		acceptanceCriteriaItems: [
			{ index: 1, text: "GREETING.md contains Hello after future approved implementation", checked: false },
		],
	});
	await setRacEnabled(root, true, { dataRoot, skipSystemAuth: true });
	let transport: MockCodexTransport | undefined;
	server = new BacklogServer(root, {
		racDataRoot: dataRoot,
		...(live
			? {}
			: {
					racConnect: async (workspace: string) => {
						transport = new MockCodexTransport((message, tx) => {
							if (message.method === "initialize") tx.emit({ id: message.id, result: {} });
							if (message.method === "thread/start")
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
							if (message.method === "turn/start") {
								tx.emit({ method: "turn/started", params: { threadId: "thread", turn: { id: "turn" } } });
								tx.emit({ id: message.id, result: { turn: { id: "turn" } } });
							}
						});
						return CodexAdapter.connect(workspace, { transportFactory: async () => transport as MockCodexTransport });
					},
				}),
	});
	await server.start(0, false);
	const descriptor = await readOwnerDescriptor(root, dataRoot);
	const url = descriptor.url;
	const html = await requireStatus(await fetch(new URL("board", url)), 200);
	const text = await html.text();
	const script = text.match(/src="(\/[^" ]+\.js)"/)?.[1];
	if (!script) throw new Error("Dashboard bundle script missing");
	await requireStatus(await fetch(new URL(script, url)), 200);
	await requireStatus(await fetch(new URL("board", url), { headers: { Host: "evil.test" } }), 403);
	await requireStatus(
		await fetch(new URL("api/tasks", url), {
			method: "POST",
			headers: { Origin: new URL(url).origin, "Content-Type": "text/plain" },
			body: '{"title":"injected"}',
		}),
		415,
	);
	await requireStatus(
		await fetch(new URL("api/tasks", url), {
			method: "POST",
			headers: { Origin: "https://evil.test", "Content-Type": "application/json" },
			body: '{"title":"injected"}',
		}),
		403,
	);
	if ((await filesystem.listTasks()).length !== 1) throw new Error("Rejected request mutated tasks");
	result.guardedHtmlAssetsAndApi = true;
	await requireStatus(
		await fetch(new URL("ws", url), {
			headers: {
				Upgrade: "websocket",
				Connection: "Upgrade",
				Origin: "https://evil.test",
				"Sec-WebSocket-Key": "dGhlIHNhbXBsZSBub25jZQ==",
				"Sec-WebSocket-Version": "13",
			},
		}),
		403,
	);
	await requireStatus(
		await fetch(new URL("api/rac/future-stream", url), {
			headers: { Accept: "text/event-stream", Origin: "https://evil.test" },
		}),
		403,
	);
	result.foreignStreamsRejected = true;
	const call = (path: string, options: Parameters<typeof callRacOwner>[2] = {}) =>
		callRacOwner(root, path, { ...options, dataRoot }) as Promise<Record<string, unknown>>;
	const paired = await call("/api/rac/pair", { method: "POST", body: {} });
	const sessionResponse = await requireStatus(
		await fetch(new URL("api/rac/session", url), {
			method: "POST",
			headers: { Origin: new URL(url).origin, "Content-Type": "application/json" },
			body: JSON.stringify({ code: paired.code }),
		}),
		200,
	);
	const cookie = sessionResponse.headers.get("set-cookie")?.split(";")[0] as string;
	await requireStatus(
		await fetch(new URL("api/rac/runs", url), {
			method: "POST",
			headers: { Origin: new URL(url).origin, "Content-Type": "application/json", cookie },
			body: "{}",
		}),
		403,
	);
	result.pairingAndCsrf = true;
	const revision = (await call("/api/rac/tasks/TASK-1/runs")).taskRevision;
	const input = { taskId: "TASK-1", expectedTaskRevision: revision };
	const started = await call("/api/rac/runs", { method: "POST", body: input, key: "smoke-start" });
	const runId = rpcRecord(started.result).runId;
	const retry = await call("/api/rac/runs", { method: "POST", body: input, key: "smoke-start" });
	if (!retry.replayed || rpcRecord(retry.result).runId !== runId) throw new Error("Idempotent start did not replay");
	result.idempotentStart = true;
	try {
		await call("/api/rac/runs", { method: "POST", body: input, key: "another-start" });
		throw new Error("Busy slot was accepted");
	} catch (error) {
		if (!(error instanceof Error) || !("code" in error) || error.code !== "run_active") throw error;
	}
	result.busy409 = true;
	if (!live) {
		const readyDeadline = Date.now() + 3000;
		while (!transport?.messages.some((message) => message.method === "turn/start") && Date.now() < readyDeadline)
			await new Promise((resolve) => setTimeout(resolve, 10));
		if (!transport?.messages.some((message) => message.method === "turn/start"))
			throw new Error("Fixture turn did not start");
	}
	if (!live)
		transport?.emit({
			method: "turn/completed",
			params: { threadId: "thread", turn: { id: "turn", status: "completed" } },
		});
	const deadline = Date.now() + 180000;
	let status = "starting";
	while (Date.now() < deadline) {
		const state = await call(`/api/rac/runs/${runId}`);
		status = String(rpcRecord(state.run).status);
		if (["completed", "interrupted", "failed", "unknown"].includes(status)) break;
		await new Promise((resolve) => setTimeout(resolve, 500));
	}
	result.runStatus = status;
	if (!["completed", "interrupted"].includes(status)) throw new Error("Planning run did not finish safely");
	if (await Bun.file(join(root, "GREETING.md")).exists())
		throw new Error("Implementation occurred during a planning-only probe");
	result.noImplementationFile = true;
	if (live) {
		const task = await filesystem.loadTask("TASK-1");
		result.planSaved = Boolean(task?.implementationPlan?.trim());
		result.taskNotDone = task?.status !== "Done";
		if (!result.planSaved || !result.taskNotDone) throw new Error("Planning workflow was not verified");
	}
	result.ok = true;
} catch (error) {
	exitCode = 1;
	result.ok = false;
	result.error =
		error instanceof Error && "code" in error
			? String(error.code)
			: error instanceof Error
				? error.message
				: "probe_failed";
} finally {
	await server?.stop();
	await rm(base, { recursive: true, force: true });
}
console.log(JSON.stringify(result, null, 2));
process.exitCode = exitCode;
