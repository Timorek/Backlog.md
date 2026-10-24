import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, realpath, rename, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveRacProject, resolveRacWorkspacePath, validateRacContext } from "../rac/project-context.ts";

let base: string;
let root: string;
beforeEach(async () => {
	base = await realpath(await mkdtemp(join(tmpdir(), "rac-project-")));
	root = join(base, "project");
	await mkdir(root);
});
afterEach(async () => {
	await rm(base, { recursive: true, force: true });
});

describe("RAC workspace identity", () => {
	test("hashes the canonical root and maps a root alias to the same identity", async () => {
		const alias = join(base, "alias");
		await symlink(root, alias);
		const project = await resolveRacProject(root);
		expect(project).toEqual({ canonicalRoot: root, projectKey: createHash("sha256").update(root).digest("hex") });
		expect(await resolveRacProject(alias)).toEqual(project);
	});
	test("a moved checkout receives a new identity", async () => {
		const project = await resolveRacProject(root);
		const moved = join(base, "moved");
		await rename(root, moved);
		expect((await resolveRacProject(moved)).projectKey).not.toBe(project.projectKey);
	});
	for (const path of [".", "project", "../project", "/tmp/../tmp", "/tmp/\0bad"]) {
		test(`rejects invalid root ${JSON.stringify(path)}`, async () => {
			await expect(resolveRacProject(path)).rejects.toThrow("absolute");
		});
	}
	test("rejects missing roots and files", async () => {
		await expect(resolveRacProject(join(root, "missing"))).rejects.toThrow();
		const file = join(root, "file");
		await writeFile(file, "data");
		await expect(resolveRacProject(file)).rejects.toThrow("directory");
	});
	test("accepts existing workspace files and internal symlinks", async () => {
		const file = join(root, "task.md");
		await writeFile(file, "task");
		const link = join(root, "alias.md");
		await symlink(file, link);
		const project = await resolveRacProject(root);
		expect(await resolveRacWorkspacePath(project, root)).toBe(root);
		expect(await resolveRacWorkspacePath(project, link)).toBe(file);
	});
	test("rejects sibling prefixes, external symlinks, relative paths and traversal", async () => {
		const sibling = `${root}-other`;
		await mkdir(sibling);
		const link = join(root, "escape");
		await symlink(sibling, link);
		const project = await resolveRacProject(root);
		for (const path of [sibling, link, "task.md", `${root}/../project`, `${root}/missing`]) {
			await expect(resolveRacWorkspacePath(project, path)).rejects.toThrow();
		}
	});
});

describe("RAC trusted context binding", () => {
	async function context() {
		const project = { ...(await resolveRacProject(root)), enabled: true };
		const owner = { ...project, generation: "owner-1" };
		const session = { ...project, id: "session-1", ownerGeneration: owner.generation };
		return { project, owner, session };
	}
	test("returns only the configured root for a matching authenticated session", async () => {
		const { project, owner, session } = await context();
		expect(await validateRacContext(project, owner, session)).toBe(root);
	});
	test("rejects disabled RAC, missing sessions, mismatched projects and stale owners", async () => {
		const { project, owner, session } = await context();
		await expect(validateRacContext({ ...project, enabled: false }, owner, session)).rejects.toThrow("disabled");
		await expect(validateRacContext(project, owner, undefined)).rejects.toThrow("must match");
		for (const change of [
			{ id: "" },
			{ projectKey: "other" },
			{ canonicalRoot: base },
			{ ownerGeneration: "previous" },
		]) {
			await expect(validateRacContext(project, owner, { ...session, ...change })).rejects.toThrow("must match");
		}
		for (const change of [{ generation: "" }, { projectKey: "other" }, { canonicalRoot: base }]) {
			await expect(validateRacContext(project, { ...owner, ...change }, session)).rejects.toThrow("must match");
		}
		await expect(validateRacContext({ ...project, projectKey: "forged" }, owner, session)).rejects.toThrow(
			"must match",
		);
	});
	test("rejects a root replaced by a symlink after configuration", async () => {
		const { project, owner, session } = await context();
		await rm(root, { recursive: true });
		await symlink(base, root);
		await expect(validateRacContext(project, owner, session)).rejects.toThrow("must match");
	});
});
