import { expect, test } from "bun:test";
import { realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname } from "node:path";
import { rpcRecord } from "../../src/rac/codex-rpc.ts";
import { MockCodexTransport } from "../../src/rac/testing/mock-codex-transport.ts";
import { runAdapterSmoke } from "./codex-adapter-smoke.ts";

async function smokeFixture(errorAt?: "start" | "interrupt") {
	let workspace: string | undefined;
	let turns = 0;
	let active = false;
	const transport = new MockCodexTransport((message, channel) => {
		const params = rpcRecord(message.params);
		if (message.method === "initialize") channel.emit({ id: message.id, result: {} });
		if (message.method === "thread/start") {
			workspace = String(params.cwd);
			channel.emit({
				id: message.id,
				result: {
					thread: { id: "thread" },
					...params,
					sandbox: {
						type: "workspaceWrite",
						writableRoots: [],
						networkAccess: false,
						excludeSlashTmp: true,
						excludeTmpdirEnvVar: true,
					},
				},
			});
		}
		if (message.method === "turn/start") {
			const id = `turn-${++turns}`;
			if (turns === 2 && errorAt === "start") {
				channel.emit({
					id: message.id,
					error: { code: -32600, message: "thread already has an active turn SYNTHETIC_PRIVATE_DETAIL" },
				});
				return;
			}
			channel.emit({ id: message.id, result: { turn: { id, status: "inProgress" } } });
			if (turns === 1) {
				channel.emit({ method: "turn/started", params: { threadId: "thread", turn: { id } } });
				channel.emit({ method: "turn/completed", params: { threadId: "thread", turn: { id, status: "completed" } } });
			} else
				setTimeout(() => {
					active = true;
					channel.emit({ method: "turn/started", params: { threadId: "thread", turn: { id } } });
				}, 15);
		}
		if (message.method === "turn/interrupt") {
			if (!active || errorAt === "interrupt")
				channel.emit({
					id: message.id,
					error: { code: -32600, message: "no active turn to interrupt SYNTHETIC_PRIVATE_DETAIL" },
				});
			else {
				channel.emit({ id: message.id, result: {} });
				channel.emit({
					method: "turn/completed",
					params: { threadId: "thread", turn: { id: "turn-2", status: "interrupted" } },
				});
			}
		}
	});
	try {
		const result = await runAdapterSmoke({ live: true, transportFactory: async () => transport });
		expect(JSON.stringify(result)).not.toContain("SYNTHETIC_PRIVATE_DETAIL");
		return result;
	} finally {
		if (workspace) {
			const fixtureRoot = dirname(workspace);
			expect(dirname(fixtureRoot)).toBe(await realpath(tmpdir()));
			expect(basename(fixtureRoot).startsWith("rac06-smoke-")).toBe(true);
			await rm(fixtureRoot, { recursive: true, force: true });
		}
	}
}

test("live smoke waits for the provider turn/started event before requesting interrupt", async () => {
	const result = await smokeFixture();
	expect(result).toMatchObject({
		modelTurn: "completed",
		interrupt: "interrupted",
		interruptAcknowledged: true,
		interruptTurnIdentity: { startedNotificationSeen: true, responseMatchesStarted: true },
	});
	expect(result.error).toBeUndefined();
});

test("live smoke reports a second-turn start error separately from interrupt errors", async () => {
	expect(await smokeFixture("start")).toMatchObject({
		modelTurn: "completed",
		error: "rpc_error",
		failedStage: "interrupt_turn_start",
		rpcFailure: { method: "turn/start", code: -32600, reason: "turn_busy" },
	});
});

test("live smoke reports an interrupt RPC error with safe method, code and reason", async () => {
	expect(await smokeFixture("interrupt")).toMatchObject({
		modelTurn: "completed",
		error: "rpc_error",
		failedStage: "interrupt_request",
		rpcFailure: { method: "turn/interrupt", code: -32600, reason: "no_active_turn" },
	});
});
