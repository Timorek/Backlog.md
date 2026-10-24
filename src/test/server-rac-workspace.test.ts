import { afterEach, beforeEach, expect, test } from "bun:test";
import { mkdir, mkdtemp, realpath, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FileSystem } from "../file-system/operations.ts";
import { type RacOwner, type RacSession, resolveRacProject, resolveRacWorkspacePath } from "../rac/project-context.ts";
import { setRacEnabled } from "../rac/project-settings.ts";
import { BacklogServer } from "../server/index.ts";

let base: string;
let root: string;
let dataRoot: string;
let server: BacklogServer;
let owner: RacOwner;
let session: RacSession;
beforeEach(async () => {
	base = await realpath(await mkdtemp(join(tmpdir(), "rac-server-")));
	root = join(base, "project");
	dataRoot = join(base, "settings");
	await mkdir(root);
	const project = await resolveRacProject(root);
	owner = { ...project, generation: "owner-1" };
	session = { ...project, id: "authenticated-session", ownerGeneration: owner.generation };
	server = new BacklogServer(root, { racDataRoot: dataRoot });
});
afterEach(async () => {
	await server.stop();
	await rm(base, { recursive: true, force: true });
});

test("backend reads its configured root and reloads enable/disable on every authorization", async () => {
	await expect(server.authorizeRacWorkspace(owner, session)).rejects.toThrow("disabled");
	await setRacEnabled(root, true, { dataRoot, skipSystemAuth: true });
	expect(await server.authorizeRacWorkspace(owner, session)).toBe(root);
	await setRacEnabled(root, false, { dataRoot, skipSystemAuth: true });
	await expect(server.authorizeRacWorkspace(owner, session)).rejects.toThrow("disabled");
});

test("the existing config API cannot enable RAC or set the local skip flag", async () => {
	await new FileSystem(root).ensureBacklogStructure();
	const handler = server as unknown as { handleUpdateConfig(request: Request): Promise<Response> };
	const response = await handler.handleUpdateConfig(
		new Request("http://127.0.0.1/api/config", {
			method: "PUT",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				projectName: "RAC config test",
				statuses: ["To Do", "In Progress", "Done"],
				labels: [],
				milestones: [],
				rac: { enabled: true, skipSystemAuth: true, canonicalRoot: base },
				skipSystemAuth: true,
			}),
		}),
	);
	expect(response.status).toBe(200);
	await expect(server.authorizeRacWorkspace(owner, session)).rejects.toThrow("disabled");
});

test("backend rejects absent sessions, different projects and old owner generations", async () => {
	await setRacEnabled(root, true, { dataRoot, skipSystemAuth: true });
	await expect(server.authorizeRacWorkspace(owner, undefined)).rejects.toThrow("must match");
	for (const changes of [
		{ projectKey: "other" },
		{ canonicalRoot: base },
		{ ownerGeneration: "previous" },
		{ id: "" },
	]) {
		await expect(server.authorizeRacWorkspace(owner, { ...session, ...changes })).rejects.toThrow("must match");
	}
	for (const changes of [{ projectKey: "other" }, { canonicalRoot: base }, { generation: "previous" }]) {
		await expect(server.authorizeRacWorkspace({ ...owner, ...changes }, session)).rejects.toThrow("must match");
	}
});

test("extra request-like cwd/path/projectId fields cannot select the backend workspace", async () => {
	await setRacEnabled(root, true, { dataRoot, skipSystemAuth: true });
	const extra = { cwd: base, path: "/", projectId: "other-project", skipSystemAuth: true };
	expect(await server.authorizeRacWorkspace({ ...owner, ...extra }, { ...session, ...extra })).toBe(root);
	await expect(server.authorizeRacWorkspace({ ...owner, ...extra }, undefined)).rejects.toThrow("must match");
});

test("another server cannot use the first project configuration or session", async () => {
	await setRacEnabled(root, true, { dataRoot, skipSystemAuth: true });
	const other = join(base, "other");
	await mkdir(other);
	const second = new BacklogServer(other, { racDataRoot: dataRoot });
	try {
		await expect(second.authorizeRacWorkspace(owner, session)).rejects.toThrow("disabled");
		await setRacEnabled(other, true, { dataRoot, skipSystemAuth: true });
		await expect(second.authorizeRacWorkspace(owner, session)).rejects.toThrow("must match");
	} finally {
		await second.stop();
	}
});

test("a root changed into an external symlink does not retain its authorization", async () => {
	await setRacEnabled(root, true, { dataRoot, skipSystemAuth: true });
	const other = join(base, "other");
	await mkdir(other);
	await rm(root, { recursive: true });
	await symlink(other, root);
	await expect(server.authorizeRacWorkspace(owner, session)).rejects.toThrow();
});

test("workspace paths beneath the authorized root still reject traversal and escaping symlinks", async () => {
	await setRacEnabled(root, true, { dataRoot, skipSystemAuth: true });
	const cwd = await server.authorizeRacWorkspace(owner, session);
	await symlink(base, join(root, "escape"));
	for (const path of [base, join(root, "escape"), `${root}/../project`, "relative"]) {
		await expect(resolveRacWorkspacePath({ ...owner, canonicalRoot: cwd }, path)).rejects.toThrow();
	}
});
