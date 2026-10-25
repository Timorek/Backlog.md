import { randomUUID } from "node:crypto";
import type { Command } from "commander";
import { callRacOwner } from "../rac/local-access.ts";
import { setRacEnabled } from "../rac/project-settings.ts";
import { addHelpSchema } from "./help-schema.ts";

export function registerRacCommand(
	program: Command,
	requireProjectRoot: () => Promise<string>,
	configure = setRacEnabled,
	callOwner = callRacOwner,
): void {
	const rac = program.command("rac").description("configure Remote Agent Control for the current project");
	for (const action of ["enable", "disable"] as const) {
		addHelpSchema(rac.command(action), {
			reads: "Current project identity and private local RAC settings",
			required: [],
			optional: [
				{
					name: "--skip-system-auth",
					type: "Boolean",
					description: "Skip system authentication without elevating OS privileges",
				},
			],
			output: "Local RAC configuration result",
			examples: [`backlog rac ${action}`, `backlog rac ${action} --skip-system-auth`],
		})
			.description(`${action} RAC with system authentication (macOS)`)
			.option("--skip-system-auth", "skip system authentication (does not elevate OS privileges)")
			.action(async (options: { skipSystemAuth?: boolean }) => {
				const root = await requireProjectRoot();
				if (options.skipSystemAuth) console.log(`Skipping system authentication for ${root} (--skip-system-auth).`);
				else
					console.log(
						`System authentication is required to ${action} RAC for ${root}. Opening the dialog may take tens of seconds.`,
					);
				const settings = await configure(root, action === "enable", { skipSystemAuth: options.skipSystemAuth });
				console.log(`RAC ${settings.enabled ? "enabled" : "disabled"} for ${settings.canonicalRoot}.`);
			});
	}
	addHelpSchema(rac.command("pair"), {
		reads: "Private local owner descriptor",
		required: [],
		optional: [],
		output: "One-use code valid for two minutes; enter at /rac/pair",
		examples: ["backlog rac pair"],
	})
		.description("pair this project's dashboard with its local RAC owner")
		.action(async () => {
			const result = await callOwner(await requireProjectRoot(), "/api/rac/pair", { method: "POST", body: {} });
			console.log(JSON.stringify(result, null, 2));
			console.log("Enter the one-use code at /rac/pair on the displayed local dashboard. Do not share or log it.");
		});
	addHelpSchema(rac.command("start <taskId>"), {
		reads: "Current task revision and authenticated local owner",
		required: [{ name: "taskId", type: "String", description: "Local actionable task ID" }],
		optional: [
			{ name: "--expected-task-revision", type: "SHA-256", description: "Refuse a task revision change" },
			{ name: "--idempotency-key", type: "String", description: "Reuse for retries of this exact start" },
		],
		output: "Versioned JSON planning-run reservation",
		examples: ["backlog rac start BACK-123 --idempotency-key planning-1"],
	})
		.description("start planning a task (implementation is unavailable)")
		.option("--expected-task-revision <sha>", "expected raw task SHA-256")
		.option("--idempotency-key <key>", "stable key for this start and its retries")
		.action(async (taskId: string, options: { expectedTaskRevision?: string; idempotencyKey?: string }) => {
			const root = await requireProjectRoot();
			let revision = options.expectedTaskRevision;
			if (!revision) {
				const history = (await callOwner(root, `/api/rac/tasks/${encodeURIComponent(taskId)}/runs`)) as {
					taskRevision?: string;
				};
				revision = history.taskRevision;
			}
			const key = options.idempotencyKey ?? randomUUID();
			console.error(`RAC start key: ${key}. Reuse this key and revision ${revision} if retrying.`);
			console.log(
				JSON.stringify(
					await callOwner(root, "/api/rac/runs", {
						method: "POST",
						body: { taskId, expectedTaskRevision: revision },
						key,
					}),
					null,
					2,
				),
			);
		});
	addHelpSchema(rac.command("status <runId>"), {
		reads: "Run state from this project's authenticated local owner",
		required: [{ name: "runId", type: "String", description: "Run identity returned by start" }],
		optional: [],
		output: "Versioned JSON run snapshot",
		examples: ["backlog rac status <runId>"],
	})
		.description("read a run from the existing RAC owner")
		.action(async (runId: string) => {
			console.log(
				JSON.stringify(
					await callOwner(await requireProjectRoot(), `/api/rac/runs/${encodeURIComponent(runId)}`),
					null,
					2,
				),
			);
		});
}
