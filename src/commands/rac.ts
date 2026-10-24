import type { Command } from "commander";
import { setRacEnabled } from "../rac/project-settings.ts";
import { addHelpSchema } from "./help-schema.ts";

export function registerRacCommand(program: Command, requireProjectRoot: () => Promise<string>): void {
	const rac = program.command("rac").description("configure Remote Agent Control for the current project");
	for (const action of ["enable", "disable"] as const) {
		addHelpSchema(rac.command(action), {
			reads: "Current project identity and private local RAC settings",
			required: [],
			optional: [],
			output: "RAC configuration result after native macOS human authentication",
			examples: [`backlog rac ${action}`],
		})
			.description(`${action} RAC with system authentication (macOS)`)
			.action(async () => {
				const root = await requireProjectRoot();
				console.log(`System authentication is required to ${action} RAC for ${root}.`);
				const settings = await setRacEnabled(root, action === "enable");
				console.log(`RAC ${settings.enabled ? "enabled" : "disabled"} for ${settings.canonicalRoot}.`);
			});
	}
}
