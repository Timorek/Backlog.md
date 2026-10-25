import { createHash } from "node:crypto";
import { realpath, stat } from "node:fs/promises";
import { isAbsolute, relative, sep } from "node:path";

export interface RacProject {
	readonly canonicalRoot: string;
	readonly projectKey: string;
}

export interface RacOwner extends RacProject {
	readonly generation: string;
}

export interface RacSession extends RacProject {
	readonly id: string;
	readonly ownerGeneration: string;
}

export class RacProjectError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "RacProjectError";
	}
}

function assertAbsolutePath(path: string): void {
	if (!isAbsolute(path) || path.includes("\0") || path.split(/[\\/]/).includes("..")) {
		throw new RacProjectError("RAC paths must be absolute and must not contain traversal segments or NUL bytes.");
	}
}

export function isWithinRoot(root: string, path: string): boolean {
	const child = relative(root, path);
	return child === "" || (!isAbsolute(child) && child !== ".." && !child.startsWith(`..${sep}`));
}

export async function resolveRacProject(root: string): Promise<RacProject> {
	assertAbsolutePath(root);
	const canonicalRoot = await realpath(root);
	if (!(await stat(canonicalRoot)).isDirectory()) {
		throw new RacProjectError("RAC project root must be an existing directory.");
	}
	return {
		canonicalRoot,
		projectKey: createHash("sha256").update(canonicalRoot).digest("hex"),
	};
}

export async function resolveRacWorkspacePath(project: RacProject, path: string): Promise<string> {
	assertAbsolutePath(path);
	if (!isWithinRoot(project.canonicalRoot, path)) {
		throw new RacProjectError("Path is outside the configured RAC workspace.");
	}
	const canonicalPath = await realpath(path);
	if (!isWithinRoot(project.canonicalRoot, canonicalPath)) {
		throw new RacProjectError("Symlink resolves outside the configured RAC workspace.");
	}
	return canonicalPath;
}

// Session and owner must come from authenticated server state, never a request payload.
export async function validateRacContext(
	project: RacProject & { readonly enabled: boolean },
	owner: RacOwner,
	session: RacSession | undefined,
): Promise<string> {
	if (!project.enabled) throw new RacProjectError("RAC is disabled for this project.");
	const current = await resolveRacProject(project.canonicalRoot);
	if (
		current.projectKey !== project.projectKey ||
		owner.projectKey !== project.projectKey ||
		owner.canonicalRoot !== project.canonicalRoot ||
		!owner.generation ||
		!session?.id ||
		session.projectKey !== project.projectKey ||
		session.canonicalRoot !== project.canonicalRoot ||
		session.ownerGeneration !== owner.generation
	) {
		throw new RacProjectError("RAC project, authenticated session and owner generation must match.");
	}
	return project.canonicalRoot;
}
