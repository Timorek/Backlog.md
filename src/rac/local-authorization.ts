import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import type { RacProject } from "./project-context.ts";

export interface RacConfigurationChange extends RacProject {
	readonly enabled: boolean;
}

export const MACOS_AUTHORIZATION_SOURCE = String.raw`
import Foundation
import LocalAuthentication

guard CommandLine.arguments.count == 3 else { exit(2) }
let action = CommandLine.arguments[1]
guard action == "enable" || action == "disable" else { exit(2) }
let root = CommandLine.arguments[2]
let context = LAContext()
context.touchIDAuthenticationAllowableReuseDuration = 0
var availabilityError: NSError?
guard context.canEvaluatePolicy(.deviceOwnerAuthentication, error: &availabilityError) else {
    fputs("System authentication is unavailable. RAC settings were not changed.\n", stderr)
    exit(1)
}
context.evaluatePolicy(
    .deviceOwnerAuthentication,
    localizedReason: "Authorize Backlog.md to \(action) Remote Agent Control for \(root)"
) { success, _ in
    guard success else {
        fputs("System authentication was denied or cancelled. RAC settings were not changed.\n", stderr)
        exit(1)
    }
    exit(0)
}
RunLoop.main.run()
`;

export async function authorizeRacChange(change: RacConfigurationChange): Promise<void> {
	if (process.platform !== "darwin") {
		throw new Error("RAC enable/disable requires native human authorization; currently available only on macOS.");
	}
	const directory = await mkdtemp(join(tmpdir(), "backlog-rac-auth-"));
	try {
		const script = join(directory, "authorize.swift");
		await writeFile(script, MACOS_AUTHORIZATION_SOURCE, { mode: 0o600 });
		const child = Bun.spawn(
			[
				"/usr/bin/swift",
				"-module-cache-path",
				join(directory, "modules"),
				script,
				change.enabled ? "enable" : "disable",
				change.canonicalRoot,
			],
			{
				cwd: directory,
				env: { PATH: "/usr/bin:/bin:/usr/sbin:/sbin", HOME: homedir(), TMPDIR: directory },
				stdin: "ignore",
				stdout: "ignore",
				stderr: "pipe",
				timeout: 180_000,
			},
		);
		const [exitCode, diagnostic] = await Promise.all([child.exited, new Response(child.stderr).text()]);
		if (exitCode !== 0) {
			throw new Error(
				`RAC authorization failed; settings were not changed. Use a normal macOS Terminal with Apple Command Line Tools installed. ${diagnostic.trim().slice(0, 500)}`,
			);
		}
	} finally {
		await rm(directory, { recursive: true, force: true });
	}
}
