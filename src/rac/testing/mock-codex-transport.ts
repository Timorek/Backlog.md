import type { CodexTransport, ProcessExit, ProcessShutdown, RpcRecord } from "../codex-rpc.ts";

export class MockCodexTransport implements CodexTransport {
	readonly messages: RpcRecord[] = [];
	readonly stdout: ReadableStream<Uint8Array>;
	readonly stderr: ReadableStream<Uint8Array>;
	readonly closed: Promise<ProcessExit>;
	private out!: ReadableStreamDefaultController<Uint8Array>;
	private err!: ReadableStreamDefaultController<Uint8Array>;
	private end!: (value: ProcessExit) => void;
	private stopped = false;
	constructor(private readonly onWrite?: (message: RpcRecord, transport: MockCodexTransport) => void) {
		this.stdout = new ReadableStream({
			start: (controller) => {
				this.out = controller;
			},
		});
		this.stderr = new ReadableStream({
			start: (controller) => {
				this.err = controller;
			},
		});
		this.closed = new Promise((resolve) => {
			this.end = resolve;
		});
	}
	async write(line: string): Promise<void> {
		if (this.stopped) throw new Error("mock closed");
		const message = JSON.parse(line) as RpcRecord;
		this.messages.push(message);
		this.onWrite?.(message, this);
	}
	emit(message: RpcRecord): void {
		this.chunk(`${JSON.stringify(message)}\n`);
	}
	chunk(text: string): void {
		this.out.enqueue(new TextEncoder().encode(text));
	}
	stderrChunk(text: string): void {
		this.err.enqueue(new TextEncoder().encode(text));
	}
	crash(code = 1): void {
		if (this.stopped) return;
		this.stopped = true;
		this.out.close();
		this.err.close();
		this.end({ code });
	}
	async close(): Promise<ProcessShutdown> {
		this.crash(0);
		return { exitedOnEof: true, forced: false, groupStopped: true };
	}
}
