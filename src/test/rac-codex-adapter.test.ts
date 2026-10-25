import { afterEach, beforeEach, expect, test } from "bun:test";
import { mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CodexAdapter, inspectCodexPolicy } from "../rac/codex-adapter.ts";
import { CodexError, type CodexProtocolEvent, type RpcRecord, rpcRecord } from "../rac/codex-rpc.ts";
import { MockCodexTransport } from "../rac/testing/mock-codex-transport.ts";

let workspace: string;
let adapter: CodexAdapter | undefined;
const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 5));
beforeEach(async () => {
	workspace = await realpath(await mkdtemp(join(tmpdir(), "rac-adapter-")));
});
afterEach(async () => {
	await adapter?.close();
	adapter = undefined;
	await rm(workspace, { recursive: true, force: true });
});

function transportFixture(
	changePolicy?: (policy: RpcRecord) => void,
	finishBeforeResponse = false,
): MockCodexTransport {
	let turn = 0;
	return new MockCodexTransport((message, transport) => {
		const params = rpcRecord(message.params);
		if (message.method === "initialize") transport.emit({ id: message.id, result: { userAgent: "fixture" } });
		if (message.method === "thread/start" || message.method === "thread/resume") {
			const policy: RpcRecord = {
				thread: { id: "thread-1" },
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
			};
			if (params.environments !== undefined) policy.sandbox = { type: "readOnly", networkAccess: false };
			changePolicy?.(policy);
			transport.emit({ id: message.id, result: policy });
		}
		if (message.method === "turn/start") {
			if (params.environments !== undefined) {
				transport.emit({
					id: message.id,
					error: { code: -32602, message: "Empty environments disables local execution in the verified host profile" },
				});
				return;
			}
			const id = `turn-${++turn}`;
			transport.emit({ method: "turn/started", params: { threadId: "thread-1", turn: { id } } });
			if (finishBeforeResponse && id === "turn-1")
				transport.emit({
					method: "turn/completed",
					params: { threadId: "thread-1", turn: { id, status: "completed" } },
				});
			transport.emit({ id: message.id, result: { turn: { id, status: "inProgress" } } });
		}
		if (message.method === "turn/steer") transport.emit({ id: message.id, result: { turnId: params.expectedTurnId } });
		if (message.method === "turn/interrupt") transport.emit({ id: message.id, result: {} });
	});
}
async function connected(transport = transportFixture()): Promise<MockCodexTransport> {
	adapter = await CodexAdapter.connect(workspace, { transportFactory: async () => transport, timeoutMs: 100 });
	return transport;
}
async function running(): Promise<MockCodexTransport> {
	const transport = await connected();
	await adapter?.startThread();
	await adapter?.startTurn("thread-1", "bounded synthetic input", "message-1");
	return transport;
}

test("initializes once before thread/turn methods and ignores caller policy/path overrides", async () => {
	const transport = await connected();
	const options = {
		model: "test-model",
		cwd: "/",
		approvalPolicy: "never",
		sandbox: "danger-full-access",
		environments: [],
	};
	expect(await adapter?.startThread(options)).toBe("thread-1");
	expect(transport.messages.map((message) => message.method)).toEqual(["initialize", "initialized", "thread/start"]);
	expect(transport.messages[2]?.params).toMatchObject({
		cwd: workspace,
		sandbox: "workspace-write",
		approvalPolicy: "on-request",
		approvalsReviewer: "user",
		model: "test-model",
	});
	expect(transport.messages[2]?.params).not.toHaveProperty("environments");
	await adapter?.startTurn("thread-1", "hello", "message-1");
	expect(transport.messages.at(-1)?.params).not.toHaveProperty("environments");
	expect(transport.messages.at(-1)?.params).toMatchObject({
		sandboxPolicy: {
			networkAccess: false,
			writableRoots: [workspace],
			excludeSlashTmp: true,
			excludeTmpdirEnvVar: true,
		},
	});
});

for (const change of [
	(policy: RpcRecord) => {
		policy.cwd = "/";
	},
	(policy: RpcRecord) => {
		policy.approvalPolicy = "never";
	},
	(policy: RpcRecord) => {
		policy.approvalsReviewer = "auto_review";
	},
	(policy: RpcRecord) => {
		rpcRecord(policy.sandbox).networkAccess = true;
	},
	(policy: RpcRecord) => {
		rpcRecord(policy.sandbox).writableRoots = ["/"];
	},
	(policy: RpcRecord) => {
		rpcRecord(policy.sandbox).excludeSlashTmp = false;
	},
	(policy: RpcRecord) => {
		policy.runtimeWorkspaceRoots = ["/"];
	},
]) {
	test("mismatched effective policy fences the process before any turn starts", async () => {
		const transport = await connected(transportFixture(change));
		await expect(adapter?.startThread()).rejects.toThrow("policy");
		await expect(adapter?.startTurn("thread-1", "hello", "message-1")).rejects.toThrow("not ready");
		expect(transport.messages.some((message) => message.method === "turn/start")).toBe(false);
	});
}

test("policy diagnostics identify failing checks without leaking paths or raw configuration", async () => {
	await connected(
		transportFixture((policy) => {
			policy.cwd = "/synthetic-private-path";
			rpcRecord(policy.sandbox).excludeTmpdirEnvVar = false;
		}),
	);
	let failure: unknown;
	try {
		await adapter?.startThread();
	} catch (error) {
		failure = error;
	}
	expect(failure).toBeInstanceOf(CodexError);
	const checks = (failure as CodexError).policyChecks;
	expect(checks).toMatchObject({ cwdMatches: false, tmpdirExcluded: false, networkDisabled: true });
	expect(Object.values(checks ?? {}).every((value) => typeof value === "boolean")).toBe(true);
	expect(JSON.stringify(checks)).not.toContain("synthetic-private-path");
	expect(JSON.stringify(checks)).not.toContain(workspace);
});

test("policy observations expose only recognized sandbox/profile names and primitive limits", () => {
	const secret = "SYNTHETIC_SECRET_NEVER_PRINT";
	const policy = inspectCodexPolicy(
		{
			cwd: secret,
			activePermissionProfile: { id: secret },
			sandbox: { type: secret, networkAccess: secret, writableRoots: [secret] },
		},
		workspace,
	);
	expect(policy.observed).toMatchObject({
		sandboxType: "unrecognized",
		permissionProfile: "custom",
		networkAccess: null,
		writableRootCount: 1,
	});
	expect(JSON.stringify(policy)).not.toContain(secret);
	expect(Object.values(policy.checks).every(Boolean)).toBe(false);
});

test("requires a loaded thread, steers the exact active turn, and starts a new turn only after completion", async () => {
	const transport = await connected();
	await expect(adapter?.startTurn("foreign", "hello", "message-1")).rejects.toThrow("verify");
	await adapter?.startThread();
	expect(await adapter?.steerOrContinue("thread-1", "first", "message-1")).toBe("turn-1");
	await expect(adapter?.startTurn("thread-1", "duplicate", "message-2")).rejects.toThrow("active");
	expect(await adapter?.steerOrContinue("thread-1", "steer", "message-2")).toBe("turn-1");
	expect(transport.messages.at(-1)?.params).toMatchObject({
		expectedTurnId: "turn-1",
		clientUserMessageId: "message-2",
	});
	transport.emit({
		method: "turn/completed",
		params: { threadId: "thread-1", turn: { id: "turn-1", status: "completed" } },
	});
	await tick();
	expect(await adapter?.steerOrContinue("thread-1", "next", "message-3")).toBe("turn-2");
});

test("interrupt acknowledgement does not pretend the turn has stopped", async () => {
	const transport = await running();
	await adapter?.interrupt("thread-1");
	await expect(adapter?.startTurn("thread-1", "too early", "message-2")).rejects.toThrow("active");
	transport.emit({
		method: "turn/completed",
		params: { threadId: "thread-1", turn: { id: "turn-1", status: "interrupted" } },
	});
	await tick();
	expect(await adapter?.startTurn("thread-1", "after interruption", "message-3")).toBe("turn-2");
});

test("approval responses are one-time, scoped and restricted by availableDecisions", async () => {
	const transport = await running();
	transport.emit({
		id: "approval-1",
		method: "item/commandExecution/requestApproval",
		params: { threadId: "thread-1", turnId: "turn-1", availableDecisions: ["decline"] },
	});
	await tick();
	for (const decision of ["accept", "acceptForSession", "acceptWithExecpolicyAmendment"]) {
		await expect(adapter?.respondToRequest("approval-1", { decision })).rejects.toThrow("allowlist");
	}
	await adapter?.respondToRequest("approval-1", { decision: "decline" });
	expect(transport.messages.at(-1)).toEqual({ id: "approval-1", result: { decision: "decline" } });
	await expect(adapter?.respondToRequest("approval-1", { decision: "decline" })).rejects.toThrow("stale");
});

test("rejects out-of-scope requests immediately and preserves ordered subscriptions", async () => {
	const transport = await running();
	const events: CodexProtocolEvent[] = [];
	const unsubscribe = adapter?.subscribe((event) => events.push(event));
	transport.emit({
		id: 0,
		method: "item/fileChange/requestApproval",
		params: { threadId: "foreign", turnId: "turn-1" },
	});
	transport.emit({ method: "item/agentMessage/delta", params: { delta: "one" } });
	transport.emit({ method: "item/agentMessage/delta", params: { delta: "two" } });
	await tick();
	expect(transport.messages).toContainEqual({
		id: 0,
		error: { code: -32602, message: "Request is outside the active RAC thread/turn" },
	});
	expect(events.map((event) => event.type)).toEqual(["request_rejected", "notification", "notification"]);
	unsubscribe?.();
	transport.emit({ method: "test", params: {} });
	await tick();
	expect(events).toHaveLength(3);
});

test("structured answers reject unknown questions and permission requests cannot grant new roots", async () => {
	const transport = await running();
	transport.emit({
		id: 1,
		method: "item/tool/requestUserInput",
		params: { threadId: "thread-1", turnId: "turn-1", questions: [{ id: "color" }] },
	});
	await tick();
	await expect(adapter?.respondToRequest(1, { answers: { unknown: { answers: ["red"] } } })).rejects.toThrow(
		"allowlist",
	);
	await adapter?.respondToRequest(1, { answers: { color: { answers: ["red"] } } });
	transport.emit({
		id: 2,
		method: "item/permissions/requestApproval",
		params: { threadId: "thread-1", turnId: "turn-1" },
	});
	await tick();
	await expect(adapter?.respondToRequest(2, { permissions: { fileSystem: { write: ["/"] } } })).rejects.toThrow(
		"allowlist",
	);
	await adapter?.respondToRequest(2, { permissions: {} });
});

test("restart handshakes a new transport and fences previous thread/request state", async () => {
	const transports: MockCodexTransport[] = [];
	adapter = await CodexAdapter.connect(workspace, {
		transportFactory: async () => {
			const transport = transportFixture();
			transports.push(transport);
			return transport;
		},
	});
	await adapter.startThread();
	await adapter.startTurn("thread-1", "hello", "message-1");
	transports[0]?.emit({
		id: 99,
		method: "item/fileChange/requestApproval",
		params: { threadId: "thread-1", turnId: "turn-1" },
	});
	await tick();
	await adapter.restart();
	expect(transports).toHaveLength(2);
	await expect(adapter.startTurn("thread-1", "not loaded", "message-2")).rejects.toThrow("verify");
	await expect(adapter.respondToRequest(99, { decision: "accept" })).rejects.toThrow("stale");
	expect(await adapter.resumeThread("thread-1")).toBe("thread-1");
	expect(transports[1]?.messages.map((message) => message.method)).toEqual([
		"initialize",
		"initialized",
		"thread/resume",
	]);
});

test("a crashed provider clears readiness and does not automatically restart", async () => {
	const transport = await running();
	transport.crash(7);
	await tick();
	await expect(adapter?.startThread()).rejects.toThrow("not ready");
});

test("close and restart cannot race to leave a new process running after shutdown", async () => {
	const transport = transportFixture();
	const close = transport.close.bind(transport);
	transport.close = async () => {
		await new Promise((resolve) => setTimeout(resolve, 20));
		return close();
	};
	await connected(transport);
	const closing = adapter?.close();
	await expect(adapter?.restart()).rejects.toThrow("in progress");
	expect(await closing).toEqual(await adapter?.close());
});

test("early completion and a reentrant next turn do not erase the new active turn", async () => {
	await connected(transportFixture(undefined, true));
	await adapter?.startThread();
	let next: Promise<string> | undefined;
	adapter?.subscribe((event) => {
		if (
			event.type === "notification" &&
			event.method === "turn/completed" &&
			rpcRecord(event.params.turn).id === "turn-1"
		)
			next = adapter?.startTurn("thread-1", "second", "message-2");
	});
	expect(await adapter?.startTurn("thread-1", "first", "message-1")).toBe("turn-1");
	expect(await next).toBe("turn-2");
	expect(await adapter?.steerOrContinue("thread-1", "steer second", "message-3")).toBe("turn-2");
});

test("handshake timeout closes the transport and never starts a thread", async () => {
	const transport = new MockCodexTransport();
	await expect(
		CodexAdapter.connect(workspace, { transportFactory: async () => transport, timeoutMs: 10 }),
	).rejects.toThrow("timeout");
	expect(transport.messages.map((message) => message.method)).toEqual(["initialize"]);
});
