import { constants } from "node:fs";
import { access, mkdir, realpath, stat } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { delimiter, dirname, isAbsolute, join } from "node:path";
import { CodexError, type CodexTransport, type ProcessShutdown } from "./codex-rpc.ts";
import { resolveRacProject } from "./project-context.ts";
import { assertPrivateRacDirectory, racSettingsLocation } from "./project-settings.ts";

export async function resolveCodexBinary(explicitPath?: string): Promise<string> {
	if (explicitPath !== undefined && !isAbsolute(explicitPath))
		throw new CodexError("binary_path", "Codex binary path must be absolute");
	const candidates =
		explicitPath !== undefined
			? [explicitPath]
			: ["/opt/homebrew/bin/codex", "/usr/local/bin/codex", join(homedir(), ".local", "bin", "codex")];
	for (const candidate of candidates) {
		try {
			const path = await realpath(candidate);
			if (
				!(await stat(path)).isFile() ||
				/\.(cmd|bat)$/i.test(path) ||
				(process.platform === "win32" && !/\.exe$/i.test(path))
			)
				continue;
			await access(path, constants.X_OK);
			return path;
		} catch {}
	}
	throw new CodexError(
		"binary_missing",
		"Configure an absolute native Codex executable path; no shell or interactive PATH lookup is used",
	);
}

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
function groupAlive(pid: number): boolean {
	try {
		process.kill(-pid, 0);
		return true;
	} catch (error) {
		if (error instanceof Error && "code" in error && error.code === "ESRCH") return false;
		throw new CodexError("cleanup_unverified", "Cannot verify the owned Codex process group");
	}
}
async function groupStopped(pid: number, timeoutMs: number): Promise<boolean> {
	const end = Date.now() + timeoutMs;
	do {
		if (!groupAlive(pid)) return true;
		await delay(20);
	} while (Date.now() < end);
	return !groupAlive(pid);
}
function signalGroup(pid: number, signal: NodeJS.Signals): void {
	try {
		process.kill(-pid, signal);
	} catch (error) {
		if (!(error instanceof Error && "code" in error && error.code === "ESRCH")) {
			throw new CodexError("cleanup_unverified", "Could not signal the owned Codex process group");
		}
	}
}

export function spawnCodexStdio(
	binary: string,
	args: readonly string[],
	options: {
		cwd: string;
		graceMs?: number;
	},
): CodexTransport {
	if (process.platform === "win32")
		throw new CodexError(
			"platform_unverified",
			"Native RAC process-tree containment on Windows is not yet implemented",
		);
	if (!isAbsolute(binary) || !isAbsolute(options.cwd))
		throw new CodexError("absolute_path_required", "Codex binary and cwd must be absolute");
	const child = Bun.spawn([binary, ...args], {
		cwd: options.cwd,
		detached: true,
		stdin: "pipe",
		stdout: "pipe",
		stderr: "pipe",
		env: {
			HOME: homedir(),
			TMPDIR: tmpdir(),
			LANG: process.env.LANG ?? "en_US.UTF-8",
			PATH: [dirname(binary), "/opt/homebrew/bin", "/usr/local/bin", "/usr/bin", "/bin", "/usr/sbin", "/sbin"].join(
				delimiter,
			),
		},
	});
	let shutdown: Promise<ProcessShutdown> | undefined;
	return {
		stdout: child.stdout,
		stderr: child.stderr,
		closed: child.exited.then((code) => ({
			code,
			signal: child.signalCode === null ? null : String(child.signalCode),
		})),
		async write(line) {
			child.stdin.write(line);
			await child.stdin.flush();
		},
		close() {
			if (!shutdown)
				shutdown = (async () => {
					const alreadyExited = child.exitCode !== null || child.signalCode !== null;
					try {
						void Promise.resolve(child.stdin.end()).catch(() => {});
					} catch {}
					let timer: ReturnType<typeof setTimeout> | undefined;
					const exitedOnEof =
						!alreadyExited &&
						(await Promise.race([
							child.exited.then(() => true),
							new Promise<false>((resolve) => {
								timer = setTimeout(() => resolve(false), options.graceMs ?? 2000);
							}),
						]));
					clearTimeout(timer);
					const forced = groupAlive(child.pid);
					if (forced) {
						signalGroup(child.pid, "SIGTERM");
						if (!(await groupStopped(child.pid, 500))) signalGroup(child.pid, "SIGKILL");
					}
					if (!(await groupStopped(child.pid, 2000)))
						throw new CodexError("cleanup_unverified", "Owned process group did not stop after cleanup");
					await child.exited;
					return { exitedOnEof, forced, groupStopped: true };
				})();
			return shutdown;
		},
	};
}

export async function startCodexTransport(
	workspace: string,
	binaryPath?: string,
	dataRoot?: string,
): Promise<CodexTransport> {
	if (process.platform === "win32")
		throw new CodexError(
			"platform_unverified",
			"Native RAC process-tree containment on Windows is not yet implemented",
		);
	const binary = await resolveCodexBinary(binaryPath);
	const project = await resolveRacProject(workspace);
	const projectData = dirname(await racSettingsLocation(project, dataRoot));
	for (const directory of [
		dirname(projectData),
		projectData,
		join(projectData, "codex-state"),
		join(projectData, "codex-log"),
	]) {
		await mkdir(directory, { recursive: true, mode: 0o700 });
		await assertPrivateRacDirectory(directory);
	}
	return spawnCodexStdio(
		binary,
		[
			"app-server",
			"--listen",
			"stdio://",
			"-c",
			"mcp_servers={}",
			"-c",
			`sqlite_home=${JSON.stringify(join(projectData, "codex-state"))}`,
			"-c",
			`log_dir=${JSON.stringify(join(projectData, "codex-log"))}`,
			"-c",
			"sandbox_workspace_write.exclude_slash_tmp=true",
			"-c",
			"sandbox_workspace_write.exclude_tmpdir_env_var=true",
			"-c",
			"sandbox_workspace_write.network_access=false",
		],
		{ cwd: workspace },
	);
}
