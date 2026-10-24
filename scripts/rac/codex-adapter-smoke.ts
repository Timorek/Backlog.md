import { mkdir, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CodexAdapter } from "../../src/rac/codex-adapter.ts";
import { resolveCodexBinary } from "../../src/rac/codex-process.ts";
import { CodexError, rpcRecord } from "../../src/rac/codex-rpc.ts";

export async function runAdapterSmoke(
	options: { live?: boolean; binaryPath?: string; model?: string } = {},
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
	try {
		const binary = await resolveCodexBinary(options.binaryPath);
		adapter = await CodexAdapter.connect(workspace, { binaryPath: binary, dataRoot: join(directory, "rac-data") });
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
		const threadId = await adapter.startThread({
			model: options.model,
			instructions:
				"Synthetic RAC adapter test in an empty temporary workspace. Do not read files, execute commands, spawn background processes or request permission changes. Use text only.",
		});
		result.threadPolicy = true;
		if (options.live) {
			const turn = async (text: string, messageId: string, interrupt: boolean) => {
				const events: { id: string; status: unknown }[] = [];
				const unsubscribe = adapter?.subscribe((event) => {
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
					const id = await adapter?.startTurn(threadId, text, messageId);
					if (interrupt && !events.some((event) => event.id === id)) await adapter?.interrupt(threadId);
					const deadline = Date.now() + 45_000;
					while (Date.now() < deadline) {
						const completed = events.find((event) => event.id === id);
						if (completed) return completed.status;
						await new Promise((resolve) => setTimeout(resolve, 20));
					}
					throw new CodexError("turn_timeout", "Synthetic model turn did not complete");
				} finally {
					unsubscribe?.();
				}
			};
			result.modelTurn = await turn("Reply with RAC_ADAPTER_OK only.", "rac06-message-1", false);
			result.interrupt = await turn(
				"Write a very long numbered list, text only, without using tools.",
				"rac06-message-2",
				true,
			);
		}
	} catch (error) {
		result.error = error instanceof CodexError ? error.code : "probe_failed";
		if (error instanceof CodexError && error.policyChecks) result.policyChecks = error.policyChecks;
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
