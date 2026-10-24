import type { Command } from "commander";
import { setRacEnabled } from "../rac/project-settings.ts";
import { addHelpSchema } from "./help-schema.ts";

export function registerRacCommand(
	program: Command,
	requireProjectRoot: () => Promise<string>,
	configure = setRacEnabled,
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
}
