import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
	chmod,
	link,
	mkdir,
	mkdtemp,
	readdir,
	readFile,
	realpath,
	rename,
	rm,
	stat,
	symlink,
	writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { resolveRacProject } from "../rac/project-context.ts";
import { loadRacSettings, racDataRoot, racSettingsLocation, setRacEnabled } from "../rac/project-settings.ts";

let base: string;
let root: string;
let data: string;
beforeEach(async () => {
	base = await realpath(await mkdtemp(join(tmpdir(), "rac-settings-")));
	root = join(base, "project");
	data = join(base, "rac");
	await mkdir(root);
});

describe("RAC authorized configuration changes", () => {
	test("explicit skip-system-auth bypasses the authorizer for enable and disable", async () => {
		let authorizations = 0;
		const authorize = async () => {
			authorizations++;
			throw new Error("native authentication must not run");
		};
		for (const enabled of [true, false]) {
			const settings = await setRacEnabled(root, enabled, { dataRoot: data, authorize, skipSystemAuth: true });
			expect(settings.enabled).toBe(enabled);
			expect(await loadRacSettings(root, data)).toEqual(settings);
		}
		expect(authorizations).toBe(0);
	});

	test("skipping system authentication preserves path and settings validation", async () => {
		await expect(setRacEnabled("relative", true, { dataRoot: data, skipSystemAuth: true })).rejects.toThrow();
		await expect(setRacEnabled(root, true, { dataRoot: join(root, "data"), skipSystemAuth: true })).rejects.toThrow();
		const path = await settingsFile({ projectKey: "wrong" });
		const before = await readFile(path, "utf8");
		await expect(setRacEnabled(root, true, { dataRoot: data, skipSystemAuth: true })).rejects.toThrow();
		expect(await readFile(path, "utf8")).toBe(before);
	});

	test("authorizes each enable/disable, atomically writes private files and round-trips through the reader", async () => {
		const changes: boolean[] = [];
		const authorize = async (change: { enabled: boolean; canonicalRoot: string }) => {
			expect(change.canonicalRoot).toBe(root);
			changes.push(change.enabled);
		};
		const enabled = await setRacEnabled(root, true, { dataRoot: data, authorize });
		expect(await loadRacSettings(root, data)).toEqual(enabled);
		const path = await racSettingsLocation(enabled, data);
		expect((await stat(data)).mode & 0o777).toBe(0o700);
		expect((await stat(dirname(path))).mode & 0o777).toBe(0o700);
		expect((await stat(path)).mode & 0o777).toBe(0o600);
		expect(await readdir(dirname(path))).toEqual(["settings.json"]);
		const disabled = await setRacEnabled(root, false, { dataRoot: data, authorize });
		expect(await loadRacSettings(root, data)).toEqual(disabled);
		expect(disabled.enabled).toBe(false);
		expect(changes).toEqual([true, false]);
	});
	test("denied authorization creates no data directory and preserves existing settings byte-for-byte", async () => {
		const authorize = async () => {
			throw new Error("denied");
		};
		await expect(setRacEnabled(root, true, { dataRoot: data, authorize })).rejects.toThrow("denied");
		await expect(stat(data)).rejects.toThrow();
		const path = await settingsFile();
		const before = await readFile(path, "utf8");
		await expect(setRacEnabled(root, false, { dataRoot: data, authorize })).rejects.toThrow("denied");
		expect(await readFile(path, "utf8")).toBe(before);
	});
	test("does not overwrite corrupt configuration or invoke authentication for an invalid root", async () => {
		let called = false;
		const authorize = async () => {
			called = true;
		};
		await expect(setRacEnabled("relative", true, { dataRoot: data, authorize })).rejects.toThrow();
		const path = await settingsFile();
		await writeFile(path, "{");
		await expect(setRacEnabled(root, true, { dataRoot: data, authorize })).rejects.toThrow();
		expect(called).toBe(false);
		expect(await readFile(path, "utf8")).toBe("{");
	});
	test("rejects a root alias redirected during authorization", async () => {
		const alias = join(base, "alias");
		const other = join(base, "other");
		await mkdir(other);
		await symlink(root, alias);
		const authorize = async () => {
			await rm(alias);
			await symlink(other, alias);
		};
		await expect(setRacEnabled(alias, true, { dataRoot: data, authorize })).rejects.toThrow("changed during");
		await expect(stat(data)).rejects.toThrow();
	});
	test("refuses data redirected into the checkout during authorization", async () => {
		await mkdir(data, { mode: 0o700 });
		const authorize = async () => {
			await rename(data, `${data}-old`);
			await symlink(root, data);
		};
		await expect(setRacEnabled(root, true, { dataRoot: data, authorize })).rejects.toThrow("symlinks");
		expect(await readdir(root)).toEqual([]);
	});
});
afterEach(async () => {
	await rm(base, { recursive: true, force: true });
});

async function settingsFile(changes: Record<string, unknown> = {}) {
	const project = await resolveRacProject(root);
	const path = await racSettingsLocation(project, data);
	await mkdir(dirname(path), { recursive: true, mode: 0o700 });
	await writeFile(path, JSON.stringify({ ...project, schemaVersion: 1, enabled: true, ...changes }), { mode: 0o600 });
	return path;
}

describe("RAC local settings", () => {
	test("uses documented OS-specific data homes", () => {
		expect(racDataRoot("darwin", "/users/test", {})).toBe("/users/test/Library/Application Support/Backlog.md/rac");
		expect(racDataRoot("linux", "/users/test", {})).toBe("/users/test/.local/state/backlog-md/rac");
		expect(racDataRoot("linux", "/users/test", { XDG_STATE_HOME: "/state" })).toBe("/state/backlog-md/rac");
		expect(() => racDataRoot("win32", "/users/test", {})).toThrow("LOCALAPPDATA");
		expect(() => racDataRoot("freebsd", "/users/test", {})).toThrow("unsupported");
	});
	test("is disabled by default and ignores repository configuration", async () => {
		await mkdir(join(root, "backlog"));
		await writeFile(join(root, "backlog", "config.yml"), "rac:\n  enabled: true\n");
		const project = await resolveRacProject(root);
		expect(await loadRacSettings(root, data)).toEqual({ ...project, schemaVersion: 1, enabled: false });
		await expect(readFile(await racSettingsLocation(project, data))).rejects.toThrow();
	});
	test("loads only a matching private configuration", async () => {
		await settingsFile();
		expect((await loadRacSettings(root, data)).enabled).toBe(true);
		await settingsFile({ enabled: false });
		expect((await loadRacSettings(root, data)).enabled).toBe(false);
	});
	for (const change of [
		{ schemaVersion: 2 },
		{ enabled: "true" },
		{ projectKey: "another-project" },
		{ canonicalRoot: "/other" },
		{ approvalPolicy: "never" },
	]) {
		test(`fails closed for invalid settings ${JSON.stringify(change)}`, async () => {
			await settingsFile(change);
			await expect(loadRacSettings(root, data)).rejects.toThrow("Invalid RAC settings");
		});
	}
	test("fails closed for malformed JSON", async () => {
		await writeFile(await settingsFile(), "{");
		await expect(loadRacSettings(root, data)).rejects.toThrow();
	});
	test("rejects oversized and hard-linked configuration files", async () => {
		const path = await settingsFile();
		await writeFile(path, " ".repeat(16_385));
		await expect(loadRacSettings(root, data)).rejects.toThrow("16 KiB");
		await settingsFile();
		await link(path, join(base, "settings-link.json"));
		await expect(loadRacSettings(root, data)).rejects.toThrow("private regular file");
	});
	test("rejects settings or directories accessible by other users", async () => {
		const path = await settingsFile();
		await chmod(path, 0o644);
		await expect(loadRacSettings(root, data)).rejects.toThrow("0600");
		await chmod(path, 0o600);
		await chmod(dirname(path), 0o755);
		await expect(loadRacSettings(root, data)).rejects.toThrow("0700");
	});
	test("rejects symlinked settings, project data directories and data roots", async () => {
		const path = await settingsFile();
		const target = join(base, "target.json");
		await writeFile(target, await readFile(path));
		await rm(path);
		await symlink(target, path);
		await expect(loadRacSettings(root, data)).rejects.toThrow();
		await rm(dirname(path), { recursive: true });
		await symlink(base, dirname(path));
		await expect(loadRacSettings(root, data)).rejects.toThrow("0700");
		await rm(data, { recursive: true });
		await symlink(root, data);
		await expect(loadRacSettings(root, data)).rejects.toThrow("symlinks");
	});
	test("rejects data inside the checkout, shared ancestors, traversal and relative roots", async () => {
		const project = await resolveRacProject(root);
		for (const path of [root, join(root, "rac"), base, "relative", `${data}/../rac`]) {
			await expect(racSettingsLocation(project, path)).rejects.toThrow();
		}
	});
});
