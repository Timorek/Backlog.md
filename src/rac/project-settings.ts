import { randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { type FileHandle, lstat, mkdir, open, realpath, rename, rm } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, isAbsolute, join } from "node:path";
import { authorizeRacChange, type RacConfigurationChange } from "./local-authorization.ts";
import { isWithinRoot, type RacProject, RacProjectError, resolveRacProject } from "./project-context.ts";

export interface RacProjectSettings extends RacProject {
	readonly schemaVersion: 1;
	readonly enabled: boolean;
}

export function racDataRoot(
	platform: NodeJS.Platform = process.platform,
	home = homedir(),
	environment: NodeJS.ProcessEnv = process.env,
): string {
	switch (platform) {
		case "darwin":
			return join(home, "Library", "Application Support", "Backlog.md", "rac");
		case "linux":
			return join(environment.XDG_STATE_HOME || join(home, ".local", "state"), "backlog-md", "rac");
		case "win32":
			if (!environment.LOCALAPPDATA) throw new RacProjectError("RAC requires LOCALAPPDATA on Windows.");
			return join(environment.LOCALAPPDATA, "Backlog.md", "rac");
		default:
			throw new RacProjectError(`RAC local configuration is unsupported on ${platform}.`);
	}
}

function isMissing(error: unknown): boolean {
	return error instanceof Error && "code" in error && error.code === "ENOENT";
}

async function canonicalDataPath(path: string): Promise<string> {
	try {
		const info = await lstat(path);
		if (info.isSymbolicLink()) throw new RacProjectError("RAC data directories must not be symlinks.");
		return await realpath(path);
	} catch (error) {
		if (!isMissing(error)) throw error;
		return join(await canonicalDataPath(dirname(path)), basename(path));
	}
}

export async function racSettingsLocation(project: RacProject, dataRoot = racDataRoot()): Promise<string> {
	if (!isAbsolute(dataRoot)) {
		throw new RacProjectError("RAC data root must be absolute.");
	}
	if (dataRoot.includes("\0") || dataRoot.split(/[\\/]/).includes("..")) {
		throw new RacProjectError("Invalid RAC data root.");
	}
	const canonicalDataRoot = await canonicalDataPath(dataRoot);
	if (
		isWithinRoot(project.canonicalRoot, canonicalDataRoot) ||
		isWithinRoot(canonicalDataRoot, project.canonicalRoot)
	) {
		throw new RacProjectError("RAC data must be outside the checkout in a dedicated directory.");
	}
	return join(canonicalDataRoot, project.projectKey, "settings.json");
}

export async function assertPrivateRacDirectory(path: string): Promise<void> {
	if (process.platform === "win32") {
		throw new RacProjectError("RAC settings access on Windows requires a verified user-only ACL implementation.");
	}
	const info = await lstat(path);
	if (!info.isDirectory() || info.isSymbolicLink() || info.uid !== process.getuid?.() || (info.mode & 0o077) !== 0) {
		throw new RacProjectError("RAC data directory must be owned by the current user with mode 0700.");
	}
}

export async function loadRacSettings(root: string, dataRoot = racDataRoot()): Promise<RacProjectSettings> {
	const project = await resolveRacProject(root);
	const path = await racSettingsLocation(project, dataRoot);
	try {
		await assertPrivateRacDirectory(dirname(dirname(path)));
		await assertPrivateRacDirectory(dirname(path));
	} catch (error) {
		if (isMissing(error)) return { ...project, schemaVersion: 1, enabled: false };
		throw error;
	}
	let file: FileHandle;
	try {
		file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
	} catch (error) {
		if (isMissing(error)) return { ...project, schemaVersion: 1, enabled: false };
		throw error;
	}
	try {
		const info = await file.stat();
		if (!info.isFile() || info.nlink !== 1 || info.uid !== process.getuid?.() || (info.mode & 0o077) !== 0) {
			throw new RacProjectError("RAC settings must be a private regular file with mode 0600.");
		}
		if (info.size > 16_384) throw new RacProjectError("RAC settings exceed the 16 KiB limit.");
		const settings: unknown = JSON.parse(await file.readFile("utf8"));
		if (
			!settings ||
			typeof settings !== "object" ||
			!("schemaVersion" in settings) ||
			settings.schemaVersion !== 1 ||
			!("enabled" in settings) ||
			typeof settings.enabled !== "boolean" ||
			!("projectKey" in settings) ||
			settings.projectKey !== project.projectKey ||
			!("canonicalRoot" in settings) ||
			settings.canonicalRoot !== project.canonicalRoot ||
			Object.keys(settings).length !== 4
		) {
			throw new RacProjectError("Invalid RAC settings or mismatched canonical project identity.");
		}
		return { ...project, schemaVersion: 1, enabled: settings.enabled };
	} finally {
		await file.close();
	}
}

export async function setRacEnabled(
	root: string,
	enabled: boolean,
	options: {
		dataRoot?: string;
		authorize?: (change: RacConfigurationChange) => Promise<void>;
		skipSystemAuth?: boolean;
	} = {},
): Promise<RacProjectSettings> {
	const dataRoot = options.dataRoot ?? racDataRoot();
	const current = await loadRacSettings(root, dataRoot);
	const path = await racSettingsLocation(current, dataRoot);
	const settings: RacProjectSettings = { ...current, enabled };
	if (!options.skipSystemAuth) await (options.authorize ?? authorizeRacChange)(settings);
	const revalidated = await resolveRacProject(root);
	if (revalidated.projectKey !== current.projectKey || (await racSettingsLocation(revalidated, dataRoot)) !== path) {
		throw new RacProjectError("RAC project or data location changed during authorization.");
	}
	const directory = dirname(path);
	await mkdir(dirname(directory), { recursive: true, mode: 0o700 });
	await assertPrivateRacDirectory(dirname(directory));
	await mkdir(directory, { recursive: true, mode: 0o700 });
	await assertPrivateRacDirectory(directory);
	const temporaryPath = join(directory, `.settings-${randomUUID()}.tmp`);
	try {
		const file = await open(temporaryPath, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL, 0o600);
		try {
			await file.writeFile(`${JSON.stringify(settings, null, 2)}\n`);
			await file.sync();
		} finally {
			await file.close();
		}
		await rename(temporaryPath, path);
	} finally {
		await rm(temporaryPath, { force: true });
	}
	return settings;
}
