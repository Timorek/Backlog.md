import { startCodexTransport } from "./codex-process.ts";
import {
	CodexError,
	type CodexProtocolEvent,
	CodexRpc,
	type CodexTransport,
	type ProcessShutdown,
	type RpcId,
	type RpcRecord,
	rpcRecord,
} from "./codex-rpc.ts";
import { resolveRacProject } from "./project-context.ts";

export const CODEX_PROTOCOL_VERSION = "0.162.1";

type AdapterOptions = {
	binaryPath?: string;
	dataRoot?: string;
	timeoutMs?: number;
	serverRequestTimeoutMs?: number;
	transportFactory?: () => Promise<CodexTransport>;
};
type ActiveTurn = { id?: string };

export function inspectCodexPolicy(response: RpcRecord, workspace: string) {
	const sandbox = rpcRecord(response.sandbox);
	const knownTypes = [
		"workspaceWrite",
		"workspace-write",
		"readOnly",
		"read-only",
		"dangerFullAccess",
		"danger-full-access",
		"externalSandbox",
		"external-sandbox",
	];
	const profile = rpcRecord(response.activePermissionProfile).id;
	return {
		checks: {
			cwdMatches: response.cwd === workspace,
			approvalPolicyOnRequest: response.approvalPolicy === "on-request",
			reviewerIsUser: response.approvalsReviewer === "user",
			workspaceWriteSandbox: sandbox.type === "workspaceWrite",
			networkDisabled: sandbox.networkAccess === false,
			slashTmpExcluded: sandbox.excludeSlashTmp === true,
			tmpdirExcluded: sandbox.excludeTmpdirEnvVar === true,
			runtimeRootsMatch:
				response.runtimeWorkspaceRoots === undefined ||
				(Array.isArray(response.runtimeWorkspaceRoots) &&
					response.runtimeWorkspaceRoots.every((root) => root === workspace)),
			writableRootsMatch:
				Array.isArray(sandbox.writableRoots) && sandbox.writableRoots.every((root) => root === workspace),
		},
		observed: {
			sandboxType:
				typeof sandbox.type === "string" && knownTypes.includes(sandbox.type) ? sandbox.type : "unrecognized",
			networkAccess: typeof sandbox.networkAccess === "boolean" ? sandbox.networkAccess : null,
			excludeSlashTmp: typeof sandbox.excludeSlashTmp === "boolean" ? sandbox.excludeSlashTmp : null,
			excludeTmpdirEnvVar: typeof sandbox.excludeTmpdirEnvVar === "boolean" ? sandbox.excludeTmpdirEnvVar : null,
			writableRootCount: Array.isArray(sandbox.writableRoots) ? sandbox.writableRoots.length : null,
			permissionProfile:
				typeof profile === "string"
					? [":workspace", ":read-only", ":full-access"].includes(profile)
						? profile
						: "custom"
					: "absent",
		},
	};
}

export class CodexAdapter {
	private rpc?: CodexRpc;
	private readonly threads = new Set<string>();
	private readonly turns = new Map<string, ActiveTurn>();
	private readonly completed = new Set<string>();
	private readonly listeners = new Set<(event: CodexProtocolEvent) => void>();
	private lifecycleBusy = false;
	private ready = false;
	private shutdownPromise?: Promise<ProcessShutdown>;

	private constructor(
		readonly workspace: string,
		private readonly options: AdapterOptions,
	) {}
	// The caller must verify RAC enablement and backend ownership before creating an adapter.
	static async connect(workspace: string, options: AdapterOptions = {}): Promise<CodexAdapter> {
		const project = await resolveRacProject(workspace);
		const adapter = new CodexAdapter(project.canonicalRoot, options);
		await adapter.open();
		return adapter;
	}
	private async open(): Promise<void> {
		const transport = await (this.options.transportFactory?.() ??
			startCodexTransport(this.workspace, this.options.binaryPath, this.options.dataRoot));
		const rpc = new CodexRpc(transport, this.options);
		this.rpc = rpc;
		rpc.subscribe((event) => {
			if (this.rpc === rpc) this.handle(event);
		});
		try {
			await rpc.request("initialize", {
				clientInfo: { name: "backlog_rac", version: "0.1.0" },
				capabilities: { experimentalApi: true },
			});
			await rpc.initialized();
			if (!rpc.isOpen) throw new CodexError("process_exited", "Codex exited during initialization");
			this.ready = true;
		} catch (error) {
			await rpc.close();
			if (error instanceof CodexError) error.diagnostics = rpc.diagnostics();
			throw error;
		}
	}
	subscribe(listener: (event: CodexProtocolEvent) => void): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}
	private emit(event: CodexProtocolEvent): void {
		for (const listener of this.listeners) {
			try {
				listener(event);
			} catch {}
		}
	}
	private handle(event: CodexProtocolEvent): void {
		if (event.type === "disconnect") {
			this.ready = false;
			this.threads.clear();
			this.turns.clear();
			this.completed.clear();
		}
		if (event.type === "notification") {
			const thread = event.params.threadId;
			const turn = rpcRecord(event.params.turn);
			if (typeof thread === "string" && typeof turn.id === "string") {
				const active = this.turns.get(thread);
				if (event.method === "turn/started" && active && !active.id) active.id = turn.id;
				if (event.method === "turn/completed") {
					this.completed.add(turn.id);
					if (this.completed.size > 64) this.completed.delete(this.completed.values().next().value as string);
					if (active?.id === turn.id) this.turns.delete(thread);
				}
			}
		}
		if (event.type === "request" && !this.inScope(event.params)) {
			void this.rpc
				?.respond(event.id, { error: { code: -32602, message: "Request is outside the active RAC thread/turn" } })
				.catch(() => {});
			this.emit({ type: "request_rejected", id: event.id, code: "request_scope" });
			return;
		}
		this.emit(event);
	}
	private inScope(params: RpcRecord): boolean {
		return (
			typeof params.threadId === "string" &&
			this.threads.has(params.threadId) &&
			typeof params.turnId === "string" &&
			this.turns.get(params.threadId)?.id === params.turnId
		);
	}
	private connection(): CodexRpc {
		if (!this.ready || !this.rpc?.isOpen || this.lifecycleBusy)
			throw new CodexError("adapter_not_ready", "Codex adapter is not ready");
		return this.rpc;
	}
	private threadPolicy(): RpcRecord {
		return {
			cwd: this.workspace,
			runtimeWorkspaceRoots: [this.workspace],
			approvalPolicy: "on-request",
			approvalsReviewer: "user",
			sandbox: "workspace-write",
		};
	}
	private verifyPolicy(response: RpcRecord): void {
		const { checks, observed } = inspectCodexPolicy(response, this.workspace);
		if (!Object.values(checks).every(Boolean)) {
			const error = new CodexError("policy_mismatch", "Effective Codex policy differs from the restricted RAC policy");
			error.policyChecks = checks;
			error.policyObserved = observed;
			throw error;
		}
	}
	private async loadThread(method: "thread/start" | "thread/resume", params: RpcRecord): Promise<string> {
		const rpc = this.connection();
		try {
			const response = rpcRecord(await rpc.request(method, { ...params, ...this.threadPolicy() }));
			this.verifyPolicy(response);
			const id = rpcRecord(response.thread).id;
			if (typeof id !== "string" || !id || (method === "thread/resume" && params.threadId !== id))
				throw new CodexError("invalid_thread", "Codex returned an invalid thread identity");
			this.threads.add(id);
			return id;
		} catch (error) {
			if (error instanceof CodexError && (error.code === "policy_mismatch" || error.code === "invalid_thread"))
				await rpc.close();
			throw error;
		}
	}
	startThread(options: { model?: string; instructions?: string } = {}): Promise<string> {
		return this.loadThread("thread/start", {
			model: options.model,
			developerInstructions: options.instructions,
		});
	}
	resumeThread(threadId: string): Promise<string> {
		return this.loadThread("thread/resume", { threadId, excludeTurns: true });
	}
	private loadedThread(threadId: string): CodexRpc {
		const rpc = this.connection();
		if (!this.threads.has(threadId))
			throw new CodexError("thread_not_loaded", "Load and verify this thread before starting a turn");
		return rpc;
	}
	async startTurn(threadId: string, text: string, clientUserMessageId: string): Promise<string> {
		const rpc = this.loadedThread(threadId);
		if (this.turns.has(threadId))
			throw new CodexError("turn_active", "This thread already has an active or starting turn");
		if (!text || !clientUserMessageId)
			throw new CodexError("invalid_input", "Text and a stable client message ID are required");
		const active: ActiveTurn = {};
		this.turns.set(threadId, active);
		try {
			const response = rpcRecord(
				await rpc.request("turn/start", {
					threadId,
					input: [{ type: "text", text }],
					clientUserMessageId,
					cwd: this.workspace,
					approvalPolicy: "on-request",
					approvalsReviewer: "user",
					sandboxPolicy: {
						type: "workspaceWrite",
						writableRoots: [this.workspace],
						networkAccess: false,
						excludeSlashTmp: true,
						excludeTmpdirEnvVar: true,
					},
				}),
			);
			const id = rpcRecord(response.turn).id;
			if (typeof id !== "string" || !id) {
				await rpc.close();
				throw new CodexError("invalid_turn", "Codex returned no turn ID");
			}
			active.id = id;
			if (this.completed.has(id) && this.turns.get(threadId) === active) this.turns.delete(threadId);
			return id;
		} catch (error) {
			if (this.turns.get(threadId) === active) this.turns.delete(threadId);
			throw error;
		}
	}
	async steerOrContinue(threadId: string, text: string, clientUserMessageId: string): Promise<string> {
		const rpc = this.loadedThread(threadId);
		const active = this.turns.get(threadId);
		if (!active) return this.startTurn(threadId, text, clientUserMessageId);
		if (!active.id) throw new CodexError("turn_start_pending", "Wait for the starting turn before steering");
		if (!text || !clientUserMessageId)
			throw new CodexError("invalid_input", "Text and a stable client message ID are required");
		const response = rpcRecord(
			await rpc.request("turn/steer", {
				threadId,
				expectedTurnId: active.id,
				input: [{ type: "text", text }],
				clientUserMessageId,
			}),
		);
		if (response.turnId !== active.id) {
			await rpc.close();
			throw new CodexError("invalid_turn", "Steer acknowledged a different turn");
		}
		return active.id;
	}
	async interrupt(threadId: string): Promise<void> {
		const rpc = this.loadedThread(threadId);
		const turnId = this.turns.get(threadId)?.id;
		if (!turnId) throw new CodexError("turn_not_active", "No active turn to interrupt");
		await rpc.request("turn/interrupt", { threadId, turnId });
	}
	// The manager must authorize the human action and persist the interaction before calling this method.
	async respondToRequest(id: RpcId, result: unknown): Promise<void> {
		const rpc = this.connection();
		const request = rpc.serverRequest(id);
		if (!request || !this.inScope(request.params))
			throw new CodexError("request_stale", "Server request is stale or outside this thread/turn");
		const answer = rpcRecord(result);
		let valid = false;
		if (
			request.method === "item/commandExecution/requestApproval" ||
			request.method === "item/fileChange/requestApproval"
		) {
			const decisions = request.params.availableDecisions;
			valid =
				Object.keys(answer).length === 1 &&
				typeof answer.decision === "string" &&
				["accept", "decline", "cancel"].includes(answer.decision) &&
				(decisions === undefined || (Array.isArray(decisions) && decisions.includes(answer.decision)));
		} else if (request.method === "item/permissions/requestApproval") {
			valid =
				Object.keys(answer).length === 1 &&
				"permissions" in answer &&
				answer.permissions !== null &&
				typeof answer.permissions === "object" &&
				!Array.isArray(answer.permissions) &&
				Object.keys(answer.permissions).length === 0;
		} else if (request.method === "mcpServer/elicitation/request") {
			valid = Object.keys(answer).length === 1 && ["decline", "cancel"].includes(String(answer.action));
		} else if (request.method === "item/tool/requestUserInput") {
			const answers = rpcRecord(answer.answers);
			const questions = request.params.questions;
			valid =
				Object.keys(answer).length === 1 &&
				"answers" in answer &&
				answer.answers !== null &&
				typeof answer.answers === "object" &&
				!Array.isArray(answer.answers) &&
				Array.isArray(questions) &&
				Object.keys(answers).every((key) => {
					const entries = rpcRecord(answers[key]).answers;
					return (
						Object.keys(rpcRecord(answers[key])).length === 1 &&
						questions.some((question) => rpcRecord(question).id === key) &&
						Array.isArray(entries) &&
						entries.every((entry) => typeof entry === "string")
					);
				});
		}
		if (!valid) throw new CodexError("response_forbidden", "Response is outside the RAC request-specific allowlist");
		await rpc.respond(id, { result: answer });
	}
	diagnostics(): { permissionDenied: boolean; authenticationFailed: boolean } {
		return this.rpc?.diagnostics() ?? { permissionDenied: false, authenticationFailed: false };
	}
	async restart(): Promise<void> {
		if (this.lifecycleBusy) throw new CodexError("lifecycle_busy", "Codex lifecycle operation is already in progress");
		this.lifecycleBusy = true;
		this.shutdownPromise = undefined;
		try {
			await this.rpc?.close();
			await this.open();
		} finally {
			this.lifecycleBusy = false;
		}
	}
	close(): Promise<ProcessShutdown> {
		if (this.shutdownPromise) return this.shutdownPromise;
		if (this.lifecycleBusy)
			return Promise.reject(new CodexError("lifecycle_busy", "Codex lifecycle operation is already in progress"));
		if (!this.rpc) return Promise.reject(new CodexError("adapter_not_ready", "Codex transport was not opened"));
		this.lifecycleBusy = true;
		this.shutdownPromise = this.rpc.close().finally(() => {
			this.lifecycleBusy = false;
		});
		return this.shutdownPromise;
	}
}
