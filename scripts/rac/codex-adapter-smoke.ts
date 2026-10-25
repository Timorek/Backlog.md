import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CodexAdapter } from "../../src/rac/codex-adapter.ts";
import { resolveCodexBinary } from "../../src/rac/codex-process.ts";
import { CodexError, type CodexTransport, rpcRecord } from "../../src/rac/codex-rpc.ts";

export async function runAdapterSmoke(
	options: {
		live?: boolean;
		binaryPath?: string;
		model?: string;
		transportFactory?: () => Promise<CodexTransport>;
	} = {},
): Promise<Record<string, unknown>> {
	const directory = await mkdtemp(join(tmpdir(), "rac06-smoke-"));
	const workspace = join(directory, "workspace");
	await mkdir(workspace, { mode: 0o700 });
	const result: Record<string, unknown> = {
		kind: "rac06-real-adapter",
		platform: process.platform,
		initialize: false,
		threadPolicy: false,
		liveRequested: options.live === true,
	};
	let adapter: CodexAdapter | undefined;
	let stage = "initialize";
	try {
		const binary = options.transportFactory ? undefined : await resolveCodexBinary(options.binaryPath);
		adapter = await CodexAdapter.connect(workspace, {
			binaryPath: binary,
			dataRoot: join(directory, "rac-data"),
			transportFactory: options.transportFactory,
		});
		result.initialize = true;
		adapter.subscribe((event) => {
			if (event.type !== "request") return;
			if (
				event.method === "item/commandExecution/requestApproval" ||
				event.method === "item/fileChange/requestApproval"
			) {
				void adapter?.respondToRequest(event.id, { decision: "decline" }).catch(() => {});
			} else if (event.method === "item/permissions/requestApproval") {
				void adapter?.respondToRequest(event.id, { permissions: {} }).catch(() => {});
			} else if (event.method === "mcpServer/elicitation/request") {
				void adapter?.respondToRequest(event.id, { action: "decline" }).catch(() => {});
			}
		});
		stage = "thread_start";
		const threadId = await adapter.startThread({
			model: options.model,
			instructions:
				"Synthetic RAC adapter test in an empty temporary workspace. Do not read files, execute commands, spawn background processes or request permission changes. Use text only.",
		});
		result.threadPolicy = true;
		if (options.live) {
			const turn = async (text: string, messageId: string, interrupt: boolean) => {
				const events: { id: string; status: unknown }[] = [];
				const started = new Set<string>();
				let responseId: string | undefined;
				const unsubscribe = adapter?.subscribe((event) => {
					if (event.type === "notification" && event.method === "turn/started" && event.params.threadId === threadId) {
						const id = rpcRecord(event.params.turn).id;
						if (typeof id === "string") started.add(id);
					}
					if (
						event.type === "notification" &&
						event.method === "turn/completed" &&
						event.params.threadId === threadId
					) {
						const value = rpcRecord(event.params.turn);
						if (typeof value.id === "string") events.push({ id: value.id, status: value.status });
					}
				});
				try {
					stage = interrupt ? "interrupt_turn_start" : "model_turn_start";
					const id = await adapter?.startTurn(threadId, text, messageId);
					responseId = id;
					if (interrupt) {
						stage = "wait_turn_started";
						const startDeadline = Date.now() + 10_000;
						while (!started.has(id as string) && !events.some((event) => event.id === id)) {
							if (Date.now() >= startDeadline)
								throw new CodexError("turn_start_timeout", "No matching turn/started before interruption");
							await new Promise((resolve) => setTimeout(resolve, 20));
						}
						if (!events.some((event) => event.id === id)) {
							stage = "interrupt_request";
							await adapter?.interrupt(threadId);
							result.interruptAcknowledged = true;
						}
					}
					stage = interrupt ? "wait_interrupt_completion" : "wait_model_completion";
					const deadline = Date.now() + 45_000;
					while (Date.now() < deadline) {
						const completed = events.find((event) => event.id === id);
						if (completed) return completed.status;
						await new Promise((resolve) => setTimeout(resolve, 20));
					}
					throw new CodexError("turn_timeout", "Synthetic model turn did not complete");
				} finally {
					if (interrupt)
						result.interruptTurnIdentity = {
							startedNotificationSeen: started.size > 0,
							responseMatchesStarted: responseId === undefined ? null : started.has(responseId),
						};
					unsubscribe?.();
				}
			};
			result.modelTurn = await turn("Reply with RAC_ADAPTER_OK only.", randomUUID(), false);
			result.interrupt = await turn(
				"Write a very long numbered list, text only, without using tools.",
				randomUUID(),
				true,
			);
		}
	} catch (error) {
		result.error = error instanceof CodexError ? error.code : "probe_failed";
		result.failedStage = stage;
		if (error instanceof CodexError && error.rpcFailure) result.rpcFailure = error.rpcFailure;
		if (error instanceof CodexError && error.policyChecks) result.policyChecks = error.policyChecks;
		if (error instanceof CodexError && error.policyObserved) result.policyObserved = error.policyObserved;
		if (error instanceof CodexError && error.diagnostics) result.diagnostics = error.diagnostics;
	} finally {
		if (adapter) {
			result.diagnostics = adapter.diagnostics();
			try {
				result.shutdown = await adapter.close();
			} catch {
				result.shutdown = { groupStopped: false };
			}
		}
	}
	return result;
}

if (import.meta.main) {
	const args = process.argv.slice(2);
	let binaryPath: string | undefined;
	let model: string | undefined;
	let live = false;
	for (let index = 0; index < args.length; index++) {
		const arg = args[index];
		if (arg === "--live") live = true;
		else if (arg === "--binary" && args[index + 1]) binaryPath = args[++index];
		else if (arg === "--model" && args[index + 1]) model = args[++index];
		else
			throw new Error(
				"Usage: bun scripts/rac/codex-adapter-smoke.ts [--live] [--binary /absolute/codex] [--model model-id]",
			);
	}
	const result = await runAdapterSmoke({ live, binaryPath, model });
	console.log(JSON.stringify(result, null, 2));
	if (
		result.error ||
		result.initialize !== true ||
		result.threadPolicy !== true ||
		(live && (result.modelTurn !== "completed" || result.interrupt !== "interrupted")) ||
		rpcRecord(result.shutdown).groupStopped !== true
	)
		process.exitCode = 1;
}
