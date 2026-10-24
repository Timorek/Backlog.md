export type RpcId = number | string;
export type RpcRecord = Record<string, unknown>;
export interface ProcessExit {
	readonly code: number | null;
	readonly signal?: string | null;
}
export interface ProcessShutdown {
	readonly exitedOnEof: boolean;
	readonly forced: boolean;
	readonly groupStopped: boolean;
}
export interface CodexTransport {
	readonly stdout: ReadableStream<Uint8Array>;
	readonly stderr: ReadableStream<Uint8Array>;
	readonly closed: Promise<ProcessExit>;
	write(line: string): Promise<void>;
	close(): Promise<ProcessShutdown>;
}

export const CODEX_REQUEST_METHODS = [
	"initialize",
	"thread/start",
	"thread/resume",
	"turn/start",
	"turn/steer",
	"turn/interrupt",
] as const;
export type CodexRequestMethod = (typeof CODEX_REQUEST_METHODS)[number];
const SERVER_REQUEST_METHODS = new Set([
	"item/commandExecution/requestApproval",
	"item/fileChange/requestApproval",
	"item/tool/requestUserInput",
	"mcpServer/elicitation/request",
	"item/permissions/requestApproval",
]);

export type CodexProtocolEvent =
	| { readonly type: "notification"; readonly method: string; readonly params: RpcRecord }
	| { readonly type: "request"; readonly id: RpcId; readonly method: string; readonly params: RpcRecord }
	| { readonly type: "unsupported_request"; readonly id: RpcId; readonly method: string }
	| { readonly type: "request_expired"; readonly id: RpcId }
	| { readonly type: "request_rejected"; readonly id: RpcId; readonly code: string }
	| { readonly type: "disconnect"; readonly code: string };

export class CodexError extends Error {
	diagnostics?: { permissionDenied: boolean; authenticationFailed: boolean };
	policyChecks?: Readonly<Record<string, boolean>>;
	policyObserved?: Readonly<Record<string, string | number | boolean | null>>;
	constructor(
		readonly code: string,
		message: string,
	) {
		super(message);
		this.name = "CodexError";
	}
}

export function rpcRecord(value: unknown): RpcRecord {
	return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as RpcRecord) : {};
}
function isId(value: unknown): value is RpcId {
	return (
		(typeof value === "string" && value.length <= 1024) || (typeof value === "number" && Number.isSafeInteger(value))
	);
}

export class CodexRpc {
	private nextId = 1;
	private failure?: CodexError;
	private readonly pending = new Map<
		RpcId,
		{
			resolve: (value: unknown) => void;
			reject: (error: Error) => void;
			timer: ReturnType<typeof setTimeout>;
		}
	>();
	private readonly requests = new Map<
		RpcId,
		{ event: Extract<CodexProtocolEvent, { type: "request" }>; timer: ReturnType<typeof setTimeout> }
	>();
	private readonly listeners = new Set<(event: CodexProtocolEvent) => void>();
	private readonly readers: ReadableStreamDefaultReader<Uint8Array>[] = [];
	private stderrTail = "";
	private writes = 0;
	private closePromise?: Promise<ProcessShutdown>;
	get isOpen(): boolean {
		return this.failure === undefined;
	}

	constructor(
		private readonly transport: CodexTransport,
		private readonly options: {
			timeoutMs?: number;
			serverRequestTimeoutMs?: number;
			maxFrameBytes?: number;
		} = {},
	) {
		void this.readStdout().catch(() => this.fail("invalid_protocol"));
		void this.readStderr().catch(() => {});
		void transport.closed.then(
			() => this.fail("process_exited"),
			() => this.fail("process_error"),
		);
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
	private fail(code: string): void {
		if (this.failure) return;
		this.failure = new CodexError(code, `Codex connection failed: ${code}`);
		for (const request of this.pending.values()) {
			clearTimeout(request.timer);
			request.reject(this.failure);
		}
		this.pending.clear();
		for (const request of this.requests.values()) clearTimeout(request.timer);
		this.requests.clear();
		this.emit({ type: "disconnect", code });
		if (code !== "connection_closed")
			void this.close().catch(() => this.emit({ type: "disconnect", code: "cleanup_unverified" }));
	}
	private async readStdout(): Promise<void> {
		const reader = this.transport.stdout.getReader();
		this.readers.push(reader);
		const decoder = new TextDecoder("utf-8", { fatal: true });
		const limit = this.options.maxFrameBytes ?? 1_048_576;
		let buffer = "";
		try {
			while (!this.failure) {
				const { done, value } = await reader.read();
				buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
				let newline = buffer.indexOf("\n");
				while (newline !== -1) {
					const line = buffer.slice(0, newline);
					buffer = buffer.slice(newline + 1);
					if (Buffer.byteLength(line) > limit) throw new Error("frame limit");
					if (line.trim()) this.dispatch(JSON.parse(line));
					if (this.failure) return;
					newline = buffer.indexOf("\n");
				}
				if (Buffer.byteLength(buffer) > limit) throw new Error("frame limit");
				if (done) {
					this.fail(buffer.trim() ? "truncated_frame" : "stdout_closed");
					return;
				}
			}
		} finally {
			reader.releaseLock();
		}
	}
	private async readStderr(): Promise<void> {
		const reader = this.transport.stderr.getReader();
		this.readers.push(reader);
		const decoder = new TextDecoder();
		try {
			while (true) {
				const { done, value } = await reader.read();
				if (done) return;
				this.stderrTail = (this.stderrTail + decoder.decode(value, { stream: true })).slice(-16_384);
			}
		} finally {
			reader.releaseLock();
		}
	}
	private dispatch(value: unknown): void {
		const message = rpcRecord(value);
		if (message.jsonrpc !== undefined && message.jsonrpc !== "2.0") throw new Error("invalid version");
		if (typeof message.method === "string") {
			if ("result" in message || "error" in message) throw new Error("invalid request");
			const params = rpcRecord(message.params);
			if (message.id === undefined) {
				if (message.method === "serverRequest/resolved" && isId(params.requestId)) this.clearRequest(params.requestId);
				this.emit({ type: "notification", method: message.method, params });
				return;
			}
			if (!isId(message.id)) throw new Error("invalid id");
			if (!SERVER_REQUEST_METHODS.has(message.method)) {
				void this.send({ id: message.id, error: { code: -32601, message: "Unsupported RAC server request" } }).catch(
					() => {},
				);
				this.emit({ type: "unsupported_request", id: message.id, method: message.method });
				return;
			}
			if (this.requests.has(message.id) || this.requests.size >= 64)
				throw new Error("duplicate or excessive server requests");
			const event = { type: "request" as const, id: message.id, method: message.method, params };
			const timer = setTimeout(() => {
				this.clearRequest(event.id);
				void this.send({
					id: event.id,
					error: { code: -32000, message: "RAC request expired; no permission granted" },
				}).catch(() => {});
				this.emit({ type: "request_expired", id: event.id });
			}, this.options.serverRequestTimeoutMs ?? 3_600_000);
			timer.unref();
			this.requests.set(event.id, { event, timer });
			this.emit(event);
			return;
		}
		if (!isId(message.id) || "result" in message === "error" in message) throw new Error("invalid response");
		const request = this.pending.get(message.id);
		if (!request) return;
		clearTimeout(request.timer);
		this.pending.delete(message.id);
		if ("error" in message)
			request.reject(new CodexError("rpc_error", `Codex RPC error ${String(rpcRecord(message.error).code)}`));
		else request.resolve(message.result);
	}
	private clearRequest(id: RpcId): void {
		const entry = this.requests.get(id);
		if (entry) clearTimeout(entry.timer);
		this.requests.delete(id);
	}
	private async send(value: RpcRecord, beforeWrite?: () => void): Promise<void> {
		if (this.failure) throw this.failure;
		const line = `${JSON.stringify(value)}\n`;
		if (Buffer.byteLength(line) > (this.options.maxFrameBytes ?? 1_048_576))
			throw new CodexError("frame_limit", "Codex RPC frame is too large");
		if (this.writes >= 64) {
			this.fail("write_queue_limit");
			throw this.failure;
		}
		beforeWrite?.();
		this.writes++;
		let timer: ReturnType<typeof setTimeout> | undefined;
		try {
			await Promise.race([
				this.transport.write(line),
				new Promise<never>((_, reject) => {
					timer = setTimeout(
						() => reject(new CodexError("write_timeout", "Codex stdin write timed out")),
						this.options.timeoutMs ?? 10_000,
					);
				}),
			]);
		} catch (error) {
			this.fail(error instanceof CodexError ? error.code : "write_failed");
			throw this.failure;
		} finally {
			clearTimeout(timer);
			this.writes--;
		}
	}
	request(method: CodexRequestMethod, params: RpcRecord): Promise<unknown> {
		if (!(CODEX_REQUEST_METHODS as readonly string[]).includes(method))
			return Promise.reject(new CodexError("method_forbidden", "Codex RPC method is not allowlisted"));
		if (this.failure) return Promise.reject(this.failure);
		if (this.pending.size >= 64)
			return Promise.reject(new CodexError("pending_limit", "Too many pending Codex requests"));
		const id = this.nextId++;
		return new Promise((resolve, reject) => {
			const timer = setTimeout(() => {
				this.pending.delete(id);
				reject(new CodexError("rpc_timeout", `Codex RPC timeout: ${method}; outcome may be unknown`));
				this.fail("request_timeout");
			}, this.options.timeoutMs ?? 10_000);
			this.pending.set(id, { resolve, reject, timer });
			void this.send({ id, method, params }).catch((error) => {
				clearTimeout(timer);
				this.pending.delete(id);
				reject(error);
			});
		});
	}
	async initialized(): Promise<void> {
		await this.send({ method: "initialized", params: {} });
	}
	serverRequest(id: RpcId): Extract<CodexProtocolEvent, { type: "request" }> | undefined {
		return this.requests.get(id)?.event;
	}
	async respond(id: RpcId, reply: { result: unknown } | { error: { code: number; message: string } }): Promise<void> {
		if (!this.requests.has(id)) throw new CodexError("request_stale", "Codex server request is stale or unknown");
		await this.send({ id, ...reply }, () => this.clearRequest(id));
	}
	diagnostics(): { permissionDenied: boolean; authenticationFailed: boolean } {
		return {
			permissionDenied: /Operation not permitted|Permission denied|sandbox_apply/.test(this.stderrTail),
			authenticationFailed: /unauthorized|not authenticated|401/i.test(this.stderrTail),
		};
	}
	close(): Promise<ProcessShutdown> {
		if (!this.closePromise) {
			this.fail("connection_closed");
			this.closePromise = this.transport.close().finally(async () => {
				await Promise.allSettled(this.readers.map((reader) => reader.cancel().catch(() => {})));
			});
		}
		return this.closePromise;
	}
}
