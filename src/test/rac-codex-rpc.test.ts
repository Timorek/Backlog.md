import { expect, test } from "bun:test";
import { CodexError, type CodexProtocolEvent, type CodexRequestMethod, CodexRpc } from "../rac/codex-rpc.ts";
import { MockCodexTransport } from "../rac/testing/mock-codex-transport.ts";

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 5));

test("RPC failures identify the correlated method and code without exposing provider error text or data", async () => {
	const transport = new MockCodexTransport();
	const rpc = new CodexRpc(transport);
	try {
		const first = rpc.request("turn/start", {});
		const second = rpc.request("turn/interrupt", {});
		transport.emit({
			id: 2,
			error: { code: -32001, message: "SYNTHETIC_PRIVATE_ERROR", data: { token: "SYNTHETIC_PRIVATE_DATA" } },
		});
		transport.emit({ id: 1, result: {} });
		let failure: unknown;
		try {
			await second;
		} catch (error) {
			failure = error;
		}
		expect(failure).toBeInstanceOf(CodexError);
		expect((failure as CodexError).rpcFailure).toEqual({
			method: "turn/interrupt",
			code: -32001,
			reason: "unclassified",
		});
		expect(JSON.stringify(failure)).not.toContain("SYNTHETIC_PRIVATE");
		expect((failure as Error).message).not.toContain("SYNTHETIC_PRIVATE");
		expect(await first).toEqual({});
	} finally {
		await rpc.close();
	}
});

test("RPC correlates out-of-order replies and preserves numeric versus string IDs", async () => {
	const transport = new MockCodexTransport();
	const rpc = new CodexRpc(transport);
	try {
		const one = rpc.request("initialize", {});
		const two = rpc.request("thread/start", {});
		transport.emit({ id: "1", result: "wrong type" });
		transport.chunk('{"id":2,"res');
		transport.chunk('ult":"two"}\n{"id":1,"result":"one"}\n');
		expect(await two).toBe("two");
		expect(await one).toBe("one");
	} finally {
		await rpc.close();
	}
});

test("unknown server requests receive immediate errors and do not block later RPC replies", async () => {
	const transport = new MockCodexTransport();
	const rpc = new CodexRpc(transport);
	const events: CodexProtocolEvent[] = [];
	rpc.subscribe((event) => events.push(event));
	try {
		const pending = rpc.request("initialize", {});
		transport.emit({ id: "server-1", method: "item/tool/call", params: { command: "touch /tmp/never-run" } });
		transport.emit({ id: 1, result: {} });
		await pending;
		expect(transport.messages).toContainEqual({
			id: "server-1",
			error: { code: -32601, message: "Unsupported RAC server request" },
		});
		expect(events).toContainEqual({ type: "unsupported_request", id: "server-1", method: "item/tool/call" });
	} finally {
		await rpc.close();
	}
});

test("server request replies preserve IDs, reject duplicates and become stale on resolution", async () => {
	const transport = new MockCodexTransport();
	const rpc = new CodexRpc(transport);
	try {
		transport.emit({ id: "7", method: "item/fileChange/requestApproval", params: {} });
		await tick();
		await expect(rpc.respond(7, { result: { decision: "decline" } })).rejects.toThrow("stale");
		await rpc.respond("7", { result: { decision: "decline" } });
		await expect(rpc.respond("7", { result: {} })).rejects.toThrow("stale");
		transport.emit({ id: 8, method: "item/fileChange/requestApproval", params: {} });
		transport.emit({ method: "serverRequest/resolved", params: { requestId: 8 } });
		await tick();
		await expect(rpc.respond(8, { result: {} })).rejects.toThrow("stale");
	} finally {
		await rpc.close();
	}
});

test("outbound method allowlist blocks general command and filesystem RPC", async () => {
	const transport = new MockCodexTransport();
	const rpc = new CodexRpc(transport);
	try {
		for (const method of ["command/exec", "fs/readFile", "thread/shellCommand", "config/value/write", "initialized"]) {
			await expect(rpc.request(method as CodexRequestMethod, {})).rejects.toThrow("allowlisted");
		}
		expect(transport.messages).toEqual([]);
	} finally {
		await rpc.close();
	}
});

test("timeout fences the connection rather than retrying an uncertain mutation", async () => {
	const transport = new MockCodexTransport();
	const rpc = new CodexRpc(transport, { timeoutMs: 10 });
	await expect(rpc.request("turn/start", {})).rejects.toThrow("outcome may be unknown");
	await expect(rpc.request("turn/start", {})).rejects.toThrow("failed");
	expect(transport.messages).toHaveLength(1);
	await rpc.close();
});

for (const frame of [
	"$(touch /tmp/not-a-shell)\n",
	"[]\n",
	'{"id":true,"result":{}}\n',
	'{"id":1,"result":{},"error":{}}\n',
]) {
	test(`invalid JSONL fails closed: ${JSON.stringify(frame)}`, async () => {
		const transport = new MockCodexTransport();
		const rpc = new CodexRpc(transport);
		const pending = rpc.request("initialize", {});
		transport.chunk(frame);
		await expect(pending).rejects.toThrow("failed");
		await rpc.close();
	});
}

test("oversized or truncated frames and process crashes reject pending requests", async () => {
	for (const mode of ["oversize", "truncated", "crash"]) {
		const transport = new MockCodexTransport();
		const rpc = new CodexRpc(transport, { maxFrameBytes: 100 });
		const pending = rpc.request("initialize", {});
		if (mode === "oversize") transport.chunk("x".repeat(101));
		if (mode === "truncated") transport.chunk('{"id":1');
		if (mode !== "oversize") transport.crash();
		await expect(pending).rejects.toThrow("failed");
		await rpc.close();
	}
});

test("unanswered requests expire without granting permission and consumer errors cannot block RPC", async () => {
	const transport = new MockCodexTransport();
	const rpc = new CodexRpc(transport, { serverRequestTimeoutMs: 10 });
	rpc.subscribe(() => {
		throw new Error("consumer failed");
	});
	transport.emit({ id: 0, method: "item/fileChange/requestApproval", params: {} });
	await new Promise((resolve) => setTimeout(resolve, 25));
	expect(transport.messages).toContainEqual({
		id: 0,
		error: { code: -32000, message: "RAC request expired; no permission granted" },
	});
	await expect(rpc.respond(0, { result: {} })).rejects.toThrow("stale");
	await rpc.close();
});

test("stderr is consumed without forwarding raw output or treating it as JSON-RPC", async () => {
	const transport = new MockCodexTransport();
	const rpc = new CodexRpc(transport);
	transport.stderrChunk("secret-like-data".repeat(2000));
	transport.stderrChunk("Operation not permitted");
	await tick();
	expect(rpc.diagnostics()).toEqual({ permissionDenied: true, authenticationFailed: false });
	await rpc.close();
});

test("a reply exceeding the frame limit remains pending for a smaller response", async () => {
	const transport = new MockCodexTransport();
	const rpc = new CodexRpc(transport, { maxFrameBytes: 200 });
	transport.emit({ id: 0, method: "item/tool/requestUserInput", params: {} });
	await tick();
	await expect(rpc.respond(0, { result: "x".repeat(201) })).rejects.toThrow("too large");
	await rpc.respond(0, { result: {} });
	expect(transport.messages.at(-1)).toEqual({ id: 0, result: {} });
	await rpc.close();
});

test("write failures reject all pending requests and fence further writes", async () => {
	const transport = new MockCodexTransport();
	transport.write = async () => {
		throw new Error("broken pipe");
	};
	const rpc = new CodexRpc(transport);
	await expect(rpc.request("initialize", {})).rejects.toThrow("write_failed");
	await expect(rpc.request("thread/start", {})).rejects.toThrow("write_failed");
	await rpc.close();
});

test("stalled responses hit a write deadline instead of leaving an approval reply pending forever", async () => {
	const transport = new MockCodexTransport();
	const rpc = new CodexRpc(transport, { timeoutMs: 10 });
	transport.emit({ id: 0, method: "item/fileChange/requestApproval", params: {} });
	await tick();
	transport.write = async () => new Promise(() => {});
	await expect(rpc.respond(0, { result: { decision: "decline" } })).rejects.toThrow("write_timeout");
	await rpc.close();
});
