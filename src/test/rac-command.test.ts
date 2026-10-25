import { expect, test } from "bun:test";
import { mkdir, mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Command, CommanderError } from "commander";
import { registerRacCommand } from "../commands/rac.ts";
import { loadRacSettings, setRacEnabled } from "../rac/project-settings.ts";

test("RAC CLI exposes explicit system-auth bypass without implying OS elevation", () => {
	const program = new Command();
	registerRacCommand(program, async () => "/project");
	const rac = program.commands.find((command) => command.name() === "rac");
	expect(rac?.commands.map((command) => command.name())).toEqual([
		"enable",
		"disable",
		"pair",
		"start",
		"resolve",
		"status",
	]);
	for (const command of rac?.commands.filter((command) => ["enable", "disable"].includes(command.name())) ?? []) {
		expect(command.helpInformation()).toContain("system authentication");
		expect(command.options.map((option) => option.long)).toEqual(["--skip-system-auth"]);
		expect(command.helpInformation().replace(/\s+/g, " ")).toContain("does not elevate OS privileges");
		expect(command.opts().skipSystemAuth).toBeUndefined();
		command.parseOptions(["--skip-system-auth"]);
		expect(command.opts().skipSystemAuth).toBe(true);
	}
});

test("CLI authenticates by default and round-trips skip mode through local configuration", async () => {
	const base = await realpath(await mkdtemp(join(tmpdir(), "rac-cli-")));
	const root = join(base, "project");
	const dataRoot = join(base, "settings");
	await mkdir(root);
	let authentications = 0;
	const authorize = async () => {
		authentications++;
	};
	try {
		for (const args of [["enable"], ["disable", "--skip-system-auth"], ["enable", "--skip-system-auth"]]) {
			const program = new Command().exitOverride();
			registerRacCommand(
				program,
				async () => root,
				(projectRoot, enabled, options) => setRacEnabled(projectRoot, enabled, { ...options, dataRoot, authorize }),
			);
			await program.parseAsync(["rac", ...args], { from: "user" });
			expect((await loadRacSettings(root, dataRoot)).enabled).toBe(args[0] === "enable");
		}
		expect(authentications).toBe(1);
	} finally {
		await rm(base, { recursive: true, force: true });
	}
});

for (const argument of ["--yes", "--admin", "--cwd=/untrusted", "--projectId=other"]) {
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
