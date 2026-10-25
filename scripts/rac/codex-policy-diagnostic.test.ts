import { expect, test } from "bun:test";
import { realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname } from "node:path";
import { rpcRecord } from "../../src/rac/codex-rpc.ts";
import { MockCodexTransport } from "../../src/rac/testing/mock-codex-transport.ts";
import { diagnoseCodexPolicy } from "./codex-policy-diagnostic.ts";

test("policy comparison reports variant differences without any model or tool execution", async () => {
	const transports: MockCodexTransport[] = [];
	let workspace: string | undefined;
	try {
		const results = await diagnoseCodexPolicy({
			transportFactory: async (root) => {
				workspace = root;
				const transport = new MockCodexTransport((message, channel) => {
					if (message.method === "initialize") channel.emit({ id: message.id, result: {} });
					if (message.method === "thread/start") {
						const params = rpcRecord(message.params);
						const compatible = params.environments === undefined;
						channel.emit({
							id: message.id,
							result: {
								cwd: root,
								approvalPolicy: "on-request",
								approvalsReviewer: "user",
								activePermissionProfile: { id: ":workspace" },
								sandbox: compatible
									? {
											type: "workspaceWrite",
											writableRoots: [],
											networkAccess: false,
											excludeSlashTmp: true,
											excludeTmpdirEnvVar: true,
										}
									: { type: "readOnly", networkAccess: false },
							},
						});
					}
				});
				transports.push(transport);
				return transport;
			},
		});
		expect(results).toHaveLength(7);
		expect(results[0]).toMatchObject({
			variant: "current",
			matches: false,
			policyObserved: { sandboxType: "readOnly", writableRootCount: null },
		});
		expect(results.find((value) => value.variant === "legacy_persistent")?.matches).toBe(true);
		expect(results.find((value) => value.variant === "without_runtime_roots")?.matches).toBe(false);
		expect(results.find((value) => value.variant === "without_environments")?.matches).toBe(true);
		expect(results.find((value) => value.variant === "current_thread_config_dotted")?.matches).toBe(false);
		for (const transport of transports) {
			expect(transport.messages.map((value) => value.method)).toEqual(["initialize", "initialized", "thread/start"]);
			expect(rpcRecord(transport.messages[2]?.params)).toMatchObject({
				sandbox: "workspace-write",
				approvalPolicy: "on-request",
				approvalsReviewer: "user",
			});
			expect((await transport.closed).code).toBe(0);
		}
		expect(JSON.stringify(results)).not.toContain(workspace as string);
	} finally {
		if (workspace) {
			expect(dirname(workspace)).toBe(await realpath(tmpdir()));
			expect(basename(workspace).startsWith("rac06-policy-")).toBe(true);
			await rm(workspace, { recursive: true, force: true });
		}
	}
});

test("policy diagnostic stops on startup failure rather than repeating the same failed launch", async () => {
	let calls = 0;
	let workspace: string | undefined;
	try {
		const results = await diagnoseCodexPolicy({
			transportFactory: async (root) => {
				workspace = root;
				calls++;
				throw new Error("SYNTHETIC_PRIVATE_STARTUP_DETAIL");
			},
		});
		expect(calls).toBe(1);
		expect(results).toEqual([{ variant: "current", initialize: false, error: "probe_failed" }]);
		expect(JSON.stringify(results)).not.toContain("SYNTHETIC_PRIVATE_STARTUP_DETAIL");
	} finally {
		if (workspace) {
			expect(dirname(workspace)).toBe(await realpath(tmpdir()));
			expect(basename(workspace).startsWith("rac06-policy-")).toBe(true);
			await rm(workspace, { recursive: true, force: true });
		}
	}
});
