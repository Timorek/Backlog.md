import { mkdtemp, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { inspectCodexPolicy } from "../../src/rac/codex-adapter.ts";
import { startCodexTransport } from "../../src/rac/codex-process.ts";
import { CodexError, CodexRpc, type CodexTransport, type RpcRecord, rpcRecord } from "../../src/rac/codex-rpc.ts";

export async function diagnoseCodexPolicy(
	options: { transportFactory?: (workspace: string, dataRoot: string) => Promise<CodexTransport> } = {},
): Promise<Record<string, unknown>[]> {
	const directory = await realpath(await mkdtemp(join(tmpdir(), "rac06-policy-")));
	const workspace = directory;
	const dataRoot = `${directory}-data`;
	const base = { cwd: workspace, sandbox: "workspace-write", approvalPolicy: "on-request", approvalsReviewer: "user" };
	const current = { runtimeWorkspaceRoots: [workspace], environments: [] };
	const config = { exclude_slash_tmp: true, exclude_tmpdir_env_var: true, network_access: false };
	const variants: [string, RpcRecord][] = [
		["current", current],
		["without_runtime_roots", { environments: [] }],
		["without_environments", { runtimeWorkspaceRoots: [workspace] }],
		["legacy_persistent", {}],
		["legacy_ephemeral", { ephemeral: true }],
		["current_thread_config_nested", { ...current, config: { sandbox_workspace_write: config } }],
		[
			"current_thread_config_dotted",
			{
				...current,
				config: Object.fromEntries(
					Object.entries(config).map(([key, value]) => [`sandbox_workspace_write.${key}`, value]),
				),
			},
		],
	];
	const results: Record<string, unknown>[] = [];
	for (const [variant, extra] of variants) {
		const result: Record<string, unknown> = { variant, initialize: false };
		let rpc: CodexRpc | undefined;
		try {
			const transport = await (options.transportFactory?.(workspace, dataRoot) ??
				startCodexTransport(workspace, undefined, dataRoot));
			rpc = new CodexRpc(transport);
			await rpc.request("initialize", {
				clientInfo: { name: "backlog_rac_policy_diagnostic", version: "0.1.0" },
				capabilities: { experimentalApi: true },
			});
			await rpc.initialized();
			result.initialize = true;
			const response = rpcRecord(await rpc.request("thread/start", { ...base, ...extra }));
			const policy = inspectCodexPolicy(response, workspace);
			result.policyChecks = policy.checks;
			result.policyObserved = policy.observed;
			result.matches = Object.values(policy.checks).every(Boolean);
		} catch (error) {
			result.error = error instanceof CodexError ? error.code : "probe_failed";
		} finally {
			if (rpc) {
				result.diagnostics = rpc.diagnostics();
				try {
					result.shutdown = await rpc.close();
				} catch {
					result.shutdown = { groupStopped: false };
				}
			}
		}
		results.push(result);
		if (result.initialize !== true || rpcRecord(result.shutdown).groupStopped !== true) break;
	}
	return results;
}

if (import.meta.main)
	console.log(
		JSON.stringify(
			{
				kind: "rac06-policy-diagnostic",
				platform: process.platform,
				modelExecution: false,
				results: await diagnoseCodexPolicy(),
			},
			null,
			2,
		),
	);
