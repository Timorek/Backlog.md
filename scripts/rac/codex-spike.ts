import { type ChildProcessWithoutNullStreams, execFile, spawn, spawnSync } from "node:child_process";
import { EventEmitter } from "node:events";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

type RpcMessage = {
	id?: number | string;
	method?: string;
	params?: Record<string, unknown>;
	result?: unknown;
	error?: { code: number; message: string };
};

type Reply = { result: unknown } | { error: { code: number; message: string } };
type Pending = {
	resolve: (value: unknown) => void;
	reject: (error: Error) => void;
	timer: ReturnType<typeof setTimeout>;
};
type Notice = { sequence: number; message: RpcMessage };

export function refusal(message: RpcMessage): Reply {
	if (
		message.method === "item/commandExecution/requestApproval" ||
		message.method === "item/fileChange/requestApproval"
	) {
		const available = message.params?.availableDecisions;
		if (Array.isArray(available)) {
			if (available.includes("decline")) return { result: { decision: "decline" } };
			if (available.includes("cancel")) return { result: { decision: "cancel" } };
			return { error: { code: -32602, message: "No permitted refusal decision; no permission granted" } };
		}
		return { result: { decision: "decline" } };
	}
	if (message.method === "item/permissions/requestApproval") return { result: { permissions: {} } };
	return { error: { code: -32601, message: "Unsupported by the RAC spike; no permission granted" } };
}

export function safeTrace(message: RpcMessage): Record<string, unknown> {
	const result = message.result as Record<string, unknown> | undefined;
	const params = message.params;
	const item = params?.item as Record<string, unknown> | undefined;
	const turn = (params?.turn ?? result?.turn) as Record<string, unknown> | undefined;
	return {
		id: message.id,
		method: message.method,
		errorCode: message.error?.code,
		resultKeys: result && typeof result === "object" ? Object.keys(result) : undefined,
		paramKeys: params ? Object.keys(params) : undefined,
		itemType: item?.type,
		turnStatus: turn?.status,
		isBlocking: params?.isBlocking,
	};
}

export class ProbeRpc {
	readonly child: ChildProcessWithoutNullStreams;
	readonly notices: Notice[] = [];
	readonly trace: Record<string, unknown>[] = [];
	readonly serverRequests: RpcMessage[] = [];
	private readonly pending = new Map<number | string, Pending>();
	private readonly events = new EventEmitter();
	private nextId = 1;
	private sequence = 0;
	private buffer = "";
	private failure: Error | undefined;
	private stderr = "";
	private exit: Promise<void>;

	constructor(
		command: string,
		args: string[],
		cwd: string,
		private readonly reply: (message: RpcMessage) => Reply = refusal,
	) {
		this.child = spawn(command, args, { cwd, stdio: ["pipe", "pipe", "pipe"], detached: process.platform !== "win32" });
		this.exit = new Promise((resolve) => this.child.once("close", () => resolve()));
		this.child.once("error", (error) => this.fail(error));
		this.child.once("close", (code, signal) =>
			this.fail(new Error(`App Server closed (code=${code}, signal=${signal})`)),
		);
		this.child.stdin.on("error", (error) => this.fail(error));
		this.child.stdout.setEncoding("utf8");
		this.child.stdout.on("data", (chunk: string) => this.receive(chunk));
		this.child.stderr.setEncoding("utf8");
		this.child.stderr.on("data", (chunk: string) => {
			this.stderr = (this.stderr + chunk).slice(-16384);
		});
	}

	private fail(error: Error): void {
		if (this.failure) return;
		this.failure = error;
		for (const request of this.pending.values()) {
			clearTimeout(request.timer);
			request.reject(error);
		}
		this.pending.clear();
		this.events.emit("failure", error);
	}

	private receive(chunk: string): void {
		this.buffer += chunk;
		if (Buffer.byteLength(this.buffer) > 1024 * 1024) {
			this.fail(new Error("Protocol buffer exceeded 1 MiB"));
			this.child.kill();
			return;
		}
		let newline = this.buffer.indexOf("\n");
		while (newline !== -1) {
			const line = this.buffer.slice(0, newline);
			this.buffer = this.buffer.slice(newline + 1);
			try {
				if (line.trim()) this.dispatch(JSON.parse(line) as RpcMessage);
			} catch {
				this.fail(new Error("Invalid JSONL from App Server"));
				this.child.kill();
				return;
			}
			newline = this.buffer.indexOf("\n");
		}
	}

	private dispatch(message: RpcMessage): void {
		if (this.trace.length < 2000) this.trace.push({ direction: "server", ...safeTrace(message) });
		if (message.method && message.id !== undefined) {
			if (this.serverRequests.length >= 200) throw new Error("Too many server requests");
			this.serverRequests.push(message);
			this.send({ id: message.id, ...this.reply(message) });
		} else if (message.method) {
			const notice = { sequence: ++this.sequence, message };
			this.notices.push(notice);
			if (this.notices.length > 1000) this.notices.shift();
			this.events.emit("notice", notice);
		} else if (message.id !== undefined) {
			const request = this.pending.get(message.id);
			if (!request) return;
			clearTimeout(request.timer);
			this.pending.delete(message.id);
			if (message.error) request.reject(new Error(`RPC error ${message.error.code}`));
			else request.resolve(message.result);
		}
	}

	send(message: RpcMessage): void {
		if (this.failure) throw this.failure;
		if (this.trace.length < 2000) this.trace.push({ direction: "client", ...safeTrace(message) });
		this.child.stdin.write(`${JSON.stringify(message)}\n`);
	}

	request(method: string, params: Record<string, unknown>, timeoutMs = 10000): Promise<unknown> {
		if (this.failure) return Promise.reject(this.failure);
		const id = this.nextId++;
		return new Promise((resolve, reject) => {
			const timer = setTimeout(() => {
				this.pending.delete(id);
				reject(new Error(`Timeout: ${method}`));
			}, timeoutMs);
			this.pending.set(id, { resolve, reject, timer });
			try {
				this.send({ id, method, params });
			} catch (error) {
				clearTimeout(timer);
				this.pending.delete(id);
				reject(error);
			}
		});
	}

	get cursor(): number {
		return this.sequence;
	}

	waitFor(method: string, after: number, timeoutMs = 45000): Promise<RpcMessage> {
		const match = this.notices.find((notice) => notice.sequence > after && notice.message.method === method);
		if (match) return Promise.resolve(match.message);
		if (this.failure) return Promise.reject(this.failure);
		return new Promise((resolve, reject) => {
			const cleanup = () => {
				clearTimeout(timer);
				this.events.off("notice", notice);
				this.events.off("failure", failed);
			};
			const failed = (error: Error) => {
				cleanup();
				reject(error);
			};
			const notice = (value: Notice) => {
				if (value.sequence > after && value.message.method === method) {
					cleanup();
					resolve(value.message);
				}
			};
			const timer = setTimeout(() => failed(new Error(`Timeout: ${method}`)), timeoutMs);
			this.events.on("notice", notice);
			this.events.on("failure", failed);
		});
	}

	diagnostics(): Record<string, boolean | number | null> {
		return {
			exitCode: this.child.exitCode,
			permissionDenied: /Operation not permitted|Permission denied|sandbox_apply/.test(this.stderr),
			stateInitializationFailed: /failed to initialize.*state/.test(this.stderr),
			authenticationFailed: /unauthorized|not authenticated|log in|401/i.test(this.stderr),
		};
	}

	async close(graceMs = 2000): Promise<{ exitedOnEof: boolean; forced: boolean }> {
		const alreadyExited = this.failure !== undefined || this.child.exitCode !== null || this.child.signalCode !== null;
		this.child.stdin.end();
		const settled = async (ms: number) => {
			let timer: ReturnType<typeof setTimeout> | undefined;
			const outcome = await Promise.race([
				this.exit.then(() => true),
				new Promise<false>((resolve) => {
					timer = setTimeout(() => resolve(false), ms);
				}),
			]);
			clearTimeout(timer);
			return outcome;
		};
		const exitedOnEof = await settled(graceMs);
		if (!exitedOnEof && this.child.pid) {
			try {
				if (process.platform === "win32") this.child.kill("SIGTERM");
				else process.kill(-this.child.pid, "SIGTERM");
			} catch {}
			if (!(await settled(500))) {
				try {
					if (process.platform === "win32") this.child.kill("SIGKILL");
					else process.kill(-this.child.pid, "SIGKILL");
				} catch {}
				if (!(await settled(2000))) throw new Error("Owned probe process did not exit after cleanup");
			}
		}
		return { exitedOnEof: !alreadyExited && exitedOnEof, forced: !exitedOnEof };
	}
}

function record(value: unknown): Record<string, unknown> {
	return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

export function verifyPolicy(value: unknown, workspace: string): void {
	const response = record(value);
	const sandbox = record(response.sandbox);
	const roots = sandbox.writableRoots ?? [];
	if (
		response.approvalPolicy !== "on-request" ||
		response.approvalsReviewer !== "user" ||
		sandbox.type !== "workspaceWrite" ||
		sandbox.networkAccess !== false ||
		!Array.isArray(roots) ||
		roots.some((root) => root !== workspace) ||
		response.cwd !== workspace
	)
		throw new Error("Effective thread policy differs from the requested restricted policy");
}

export async function runProbe(live: boolean, command = "codex"): Promise<string> {
	const directory = await mkdtemp(join(tmpdir(), "rac03-probe-"));
	const workspace = join(directory, "workspace");
	await mkdir(workspace, { mode: 0o700 });
	const version = spawnSync(command, ["--version"], { encoding: "utf8", timeout: 5000 });
	const versionMatch = version.stdout?.match(/codex-cli ([0-9]+\.[0-9]+\.[0-9]+(?:[-+][A-Za-z0-9.-]+)?)/);
	const results: Record<string, unknown> = {
		kind: "real-app-server-probe",
		cliVersion: versionMatch?.[1] ?? "unknown",
		liveRequested: live,
		platform: process.platform,
		initialize: false,
		modelExecution: "not_attempted",
		effectivePolicyVerified: false,
		structuredQuestion: "not_tested",
		approval: "not_tested",
		interrupt: "not_tested",
		fallback: "not_tested",
		resume: "not_tested",
		sandboxIsolation: "not_tested",
	};
	const rpc = new ProbeRpc(
		command,
		[
			"app-server",
			"--listen",
			"stdio://",
			"-c",
			"mcp_servers={}",
			"-c",
			`sqlite_home=${JSON.stringify(join(directory, "state"))}`,
			"-c",
			`log_dir=${JSON.stringify(join(directory, "log"))}`,
		],
		workspace,
		(message) => {
			if (message.method === "item/tool/requestUserInput") {
				const questions = message.params?.questions;
				if (Array.isArray(questions) && questions.length === 1 && record(questions[0]).id === "rac_spike_color") {
					return { result: { answers: { rac_spike_color: { answers: ["RAC_OPTION_A"] } } } };
				}
			}
			return refusal(message);
		},
	);
	const onSignal = () => {
		void rpc.close(500).catch(() => {
			process.exitCode = 1;
		});
	};
	process.once("SIGINT", onSignal);
	process.once("SIGTERM", onSignal);
	try {
		console.log("RAC-03: initialize");
		await rpc.request("initialize", {
			clientInfo: { name: "backlog_rac_spike", version: "0.1.0" },
			capabilities: { experimentalApi: true },
		});
		rpc.send({ method: "initialized", params: {} });
		results.initialize = true;
		const models = record(await rpc.request("model/list", { limit: 100 }));
		results.availableModels = Array.isArray(models.data) ? models.data.map((model) => record(model).id) : [];
		const policy = {
			approvalPolicy: "on-request",
			approvalsReviewer: "user",
			sandbox: "workspace-write",
			cwd: workspace,
		};
		const start = record(
			await rpc.request("thread/start", {
				...policy,
				ephemeral: true,
				developerInstructions:
					"This is a bounded RAC protocol spike in an empty temporary workspace. Use only synthetic RAC inputs. Do not read account configuration, user files or repositories. Do not spawn background work. Do not modify files unless explicitly named by the synthetic probe. Never request blanket permissions.",
			}),
		);
		verifyPolicy(start, workspace);
		results.effectivePolicyVerified = true;
		results.model = start.model;
		const threadId = record(start.thread).id;
		if (typeof threadId !== "string") throw new Error("Missing thread ID");
		try {
			const resumed = await rpc.request("thread/resume", { ...policy, threadId, excludeTurns: true });
			verifyPolicy(resumed, workspace);
			results.resume = "verified_same_process";
		} catch (error) {
			results.resume = "failed_in_probe";
			results.resumeFailure = error instanceof Error ? error.message.slice(0, 200) : "unknown";
		}
		const sandboxPolicy = {
			type: "workspaceWrite",
			writableRoots: [workspace],
			networkAccess: false,
			excludeSlashTmp: true,
			excludeTmpdirEnvVar: true,
		};
		const turn = async (text: string, outputSchema?: Record<string, unknown>) => {
			const cursor = rpc.cursor;
			await rpc.request("turn/start", {
				threadId,
				input: [{ type: "text", text }],
				sandboxPolicy,
				approvalPolicy: "on-request",
				approvalsReviewer: "user",
				...(outputSchema ? { outputSchema } : {}),
			});
			const done = await rpc.waitFor("turn/completed", cursor);
			const status = record(done.params?.turn).status;
			if (status !== "completed") throw new Error(`Model turn did not complete successfully: ${String(status)}`);
			return rpc.notices
				.filter((notice) => notice.sequence > cursor)
				.filter((notice) => notice.message.method === "item/agentMessage/delta")
				.map((notice) => String(notice.message.params?.delta ?? ""))
				.join("");
		};
		if (live) {
			console.log("RAC-03: synthetic model question and fallback");
			results.modelExecution = "attempted";
			await turn(
				"Use request_user_input to ask a synthetic question with id rac_spike_color, choosing RAC_OPTION_A or RAC_OPTION_B. This tests tool availability only. If the tool is unavailable, say RAC_TOOL_UNAVAILABLE. Do not use shell or read files.",
			);
			results.modelExecution = "verified";
			const question = rpc.serverRequests.find((message) => message.method === "item/tool/requestUserInput");
			results.structuredQuestion = question
				? { observed: true, isBlocking: question.params?.isBlocking }
				: "not_observed";
			const schema = {
				type: "object",
				properties: { kind: { type: "string", enum: ["question"] }, question: { type: "string" } },
				required: ["kind", "question"],
				additionalProperties: false,
			};
			const text = await turn(
				"Return a synthetic JSON question asking whether to choose RAC_OPTION_A or RAC_OPTION_B. Do not call tools.",
				schema,
			);
			const parsed = record(JSON.parse(text));
			if (parsed.kind !== "question" || typeof parsed.question !== "string")
				throw new Error("Unexpected fallback question");
			const answer = await turn(
				"Answer to the preceding synthetic question: RAC_OPTION_A. Reply exactly RAC_FALLBACK_RECEIVED and do not call tools.",
			);
			if (!answer.includes("RAC_FALLBACK_RECEIVED")) throw new Error("Fallback answer was not acknowledged");
			results.fallback = "two_successful_turns_same_thread";
			console.log("RAC-03: approval denial");
			const requestsBefore = rpc.serverRequests.length;
			await turn(
				`Request permission to write RAC_SYNTHETIC_ONLY into ${join(directory, "outside-workspace.txt")}, which is outside the permitted writable workspace. The harness will decline; respect that denial. Do not use background processes, network, or read any other path.`,
			);
			results.approval = rpc.serverRequests
				.slice(requestsBefore)
				.some((request) => request.method?.endsWith("requestApproval"))
				? "observed_and_denied"
				: "not_observed";
			results.outsideFileCreated = existsSync(join(directory, "outside-workspace.txt"));
			if (results.outsideFileCreated) throw new Error("Outside-workspace write unexpectedly succeeded");
			console.log("RAC-03: interrupt");
			const cursor = rpc.cursor;
			const started = record(
				await rpc.request("turn/start", {
					threadId,
					input: [
						{
							type: "text",
							text: "Count slowly from one to one hundred in words without tools; the client will interrupt.",
						},
					],
					sandboxPolicy,
					approvalPolicy: "on-request",
					approvalsReviewer: "user",
				}),
			);
			const turnId = record(started.turn).id;
			await rpc.request("turn/interrupt", { threadId, turnId });
			const completed = await rpc.waitFor("turn/completed", cursor);
			results.interrupt = record(completed.params?.turn).status === "interrupted" ? "verified" : "raced_completion";
		}
	} catch (error) {
		const message = error instanceof Error ? error.message : "Unknown failure";
		results.failure = message.replaceAll(directory, "<probe-dir>").slice(0, 300);
	} finally {
		results.shutdown = await rpc.close();
		process.off("SIGINT", onSignal);
		process.off("SIGTERM", onSignal);
		results.diagnostics = rpc.diagnostics();
		results.serverRequestMethods = rpc.serverRequests.map((message) => ({
			method: message.method,
			isBlocking: message.params?.isBlocking,
		}));
		await writeFile(join(directory, "report.json"), `${JSON.stringify(results, null, 2)}\n`, { mode: 0o600 });
		await writeFile(join(directory, "trace.json"), `${JSON.stringify(rpc.trace, null, 2)}\n`, { mode: 0o600 });
	}
	console.log(JSON.stringify(results, null, 2));
	console.log(`Private artifacts: ${directory}`);
	return directory;
}

export async function runSandboxProbe(): Promise<Record<string, unknown>> {
	if (process.platform !== "darwin") throw new Error("This sandbox probe requires macOS");
	const directory = await mkdtemp(join(tmpdir(), "rac03-sandbox-"));
	const workspace = join(directory, "workspace");
	await mkdir(workspace, { mode: 0o700 });
	await writeFile(join(directory, "canary.txt"), "RAC_SYNTHETIC_CANARY", { mode: 0o600 });
	const server = createServer((socket) => socket.end());
	let port = 9;
	let listenerAvailable = false;
	let listenerError: string | undefined;
	await new Promise<void>((resolve) => {
		server.once("error", (error: NodeJS.ErrnoException) => {
			listenerError = error.code;
			resolve();
		});
		server.listen(0, "127.0.0.1", () => {
			const address = server.address();
			if (address && typeof address !== "string") {
				port = address.port;
				listenerAvailable = true;
			}
			resolve();
		});
	});
	const program = [
		"import json,socket",
		"from pathlib import Path",
		"r={}",
		"try:",
		` r["syntheticOutsideRead"]=Path(${JSON.stringify(join(directory, "canary.txt"))}).read_text()=="RAC_SYNTHETIC_CANARY"`,
		'except OSError as e:r["outsideReadErrno"]=e.errno',
		"s=socket.socket();s.settimeout(1)",
		"try:",
		` s.connect(("127.0.0.1",${port}));r["loopbackConnected"]=True`,
		'except OSError as e:r["loopbackErrno"]=e.errno',
		"finally:s.close()",
		"print(json.dumps(r))",
	].join("\n");
	const report: Record<string, unknown> = { kind: "real-codex-sandbox-probe", listenerAvailable, listenerError };
	try {
		const { stdout } = await promisify(execFile)(
			"codex",
			[
				"sandbox",
				"--permission-profile",
				":workspace",
				"--include-managed-config",
				"-C",
				workspace,
				"-c",
				"sandbox_workspace_write.network_access=false",
				"/usr/bin/python3",
				"-c",
				program,
			],
			{ cwd: workspace, timeout: 10000, maxBuffer: 16384 },
		);
		report.result = JSON.parse(stdout);
		report.commandCompleted = true;
	} catch (error) {
		const failure = error as Error & { code?: string | number; stderr?: string };
		report.commandCompleted = false;
		report.exitCode = failure.code;
		report.sandboxApplyDenied = /sandbox_apply.*Operation not permitted/.test(failure.stderr ?? "");
	} finally {
		if (server.listening) await new Promise<void>((resolve) => server.close(() => resolve()));
	}
	await writeFile(join(directory, "report.json"), `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
	console.log(JSON.stringify(report, null, 2));
	console.log(`Private artifacts: ${directory}`);
	return report;
}

if (import.meta.main) {
	const args = process.argv.slice(2);
	if (args.length !== 1 || !["--preflight", "--live", "--sandbox"].includes(args[0] ?? "")) {
		console.error("Usage: bun scripts/rac/codex-spike.ts --preflight|--live|--sandbox");
		process.exitCode = 2;
	} else if (args[0] === "--sandbox") {
		const report = await runSandboxProbe();
		if (!report.commandCompleted) process.exitCode = 1;
	} else {
		const directory = await runProbe(args[0] === "--live");
		const report = await Bun.file(join(directory, "report.json")).json();
		if (
			report.failure ||
			!report.initialize ||
			!report.effectivePolicyVerified ||
			(args[0] === "--live" &&
				(report.modelExecution !== "verified" ||
					report.fallback !== "two_successful_turns_same_thread" ||
					report.approval !== "observed_and_denied" ||
					report.interrupt !== "verified"))
		)
			process.exitCode = 1;
	}
}
