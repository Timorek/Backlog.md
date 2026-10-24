import { expect, test } from "bun:test";
import { Command, CommanderError } from "commander";
import { registerRacCommand } from "../commands/rac.ts";

test("RAC CLI exposes enable/disable with system authentication and no bypass options", () => {
	const program = new Command();
	registerRacCommand(program, async () => "/project");
	const rac = program.commands.find((command) => command.name() === "rac");
	expect(rac?.commands.map((command) => command.name())).toEqual(["enable", "disable"]);
	for (const command of rac?.commands ?? []) {
		expect(command.helpInformation()).toContain("system authentication");
		expect(command.options).toEqual([]);
	}
});

for (const argument of ["--yes", "--cwd=/untrusted", "--projectId=other"]) {
	test(`RAC enable rejects ${argument} before resolving the project`, async () => {
		let resolved = false;
		const program = new Command().exitOverride().configureOutput({ writeErr: () => {} });
		registerRacCommand(program, async () => {
			resolved = true;
			return "/project";
		});
		await expect(program.parseAsync(["rac", "enable", argument], { from: "user" })).rejects.toBeInstanceOf(
			CommanderError,
		);
		expect(resolved).toBe(false);
	});
}

test("RAC commands use the existing project resolver and propagate its failures", async () => {
	const program = new Command().exitOverride();
	registerRacCommand(program, async () => {
		throw new Error("No project");
	});
	await expect(program.parseAsync(["rac", "disable"], { from: "user" })).rejects.toThrow("No project");
});
