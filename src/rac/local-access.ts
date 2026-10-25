import { randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { constants } from "node:fs";
import { open, rename, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { LocalRequestError } from "../server/local-policy.ts";
import { type RacOwner, resolveRacProject } from "./project-context.ts";
import { assertPrivateRacDirectory, racSettingsLocation } from "./project-settings.ts";

export interface OwnerDescriptor {
	schemaVersion: 1;
	projectKey: string;
	generation: string;
	url: string;
	secret: string;
}
const secret = () => randomBytes(32).toString("base64url");
function equal(a: string, b: string): boolean {
	const left = Buffer.from(a);
	const right = Buffer.from(b);
	return left.length === right.length && timingSafeEqual(left, right);
}
function denied(code = "session_required", status = 401): never {
	throw new LocalRequestError(code, "Pair this dashboard with the local RAC owner", status);
}

export async function readOwnerDescriptor(root: string, dataRoot?: string): Promise<OwnerDescriptor> {
	try {
		const project = await resolveRacProject(root);
		const directory = dirname(await racSettingsLocation(project, dataRoot));
		await assertPrivateRacDirectory(dirname(directory));
		await assertPrivateRacDirectory(directory);
		const file = await open(
			join(directory, "owner.json"),
			constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
		);
		try {
			const info = await file.stat();
			if (
				!info.isFile() ||
				info.nlink !== 1 ||
				info.uid !== process.getuid?.() ||
				(info.mode & 0o077) !== 0 ||
				info.size > 4096
			)
				denied();
			const value = JSON.parse(await file.readFile("utf8")) as OwnerDescriptor;
			const url = new URL(value.url);
			if (
				value.schemaVersion !== 1 ||
				value.projectKey !== project.projectKey ||
				!/^[a-f0-9-]{36}$/.test(value.generation) ||
				!/^[A-Za-z0-9_-]{43}$/.test(value.secret) ||
				url.protocol !== "http:" ||
				url.hostname !== "127.0.0.1" ||
				url.pathname !== "/" ||
				url.search ||
				url.hash ||
				url.username ||
				url.password
			)
				denied();
			return value;
		} finally {
			await file.close();
		}
	} catch {
		throw new LocalRequestError(
			"owner_unavailable",
			"Start this project's local dashboard with RAC enabled and verify its private owner settings",
			503,
		);
	}
}

export class LocalRacAccess {
	readonly credential: string;
	readonly cookieName: string;
	private pairing?: { code: string; expires: number; attempts: number };
	private readonly sessions = new Map<string, { csrf: string; expires: number }>();
	private descriptorPath?: string;
	private closed = false;
	constructor(
		readonly owner: RacOwner,
		private readonly now = Date.now,
		private readonly protectSecret: (value: string, expiresAt?: number) => void = () => {},
	) {
		this.credential = secret();
		this.protectSecret(this.credential);
		this.cookieName = `rac_${owner.projectKey}`;
	}
	async publish(url: string, dataRoot?: string): Promise<void> {
		const directory = dirname(await racSettingsLocation(this.owner, dataRoot));
		await assertPrivateRacDirectory(directory);
		const path = join(directory, "owner.json");
		const temporary = join(directory, `.owner-${randomUUID()}`);
		const file = await open(
			temporary,
			constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
			0o600,
		);
		try {
			await file.writeFile(
				JSON.stringify({
					schemaVersion: 1,
					projectKey: this.owner.projectKey,
					generation: this.owner.generation,
					url,
					secret: this.credential,
				} satisfies OwnerDescriptor),
			);
			await file.sync();
		} catch (error) {
			await rm(temporary, { force: true });
			throw error;
		} finally {
			await file.close();
		}
		try {
			await rename(temporary, path);
			this.descriptorPath = path;
		} finally {
			await rm(temporary, { force: true });
		}
	}
	authorize(request: Request, mutation = false): "cli" | "browser" {
		if (this.closed) denied();
		if (request.headers.has("authorization")) {
			if (
				!equal(request.headers.get("authorization") ?? "", `Bearer ${this.credential}`) ||
				request.headers.get("x-rac-project") !== this.owner.projectKey ||
				request.headers.get("x-rac-owner") !== this.owner.generation
			)
				denied();
			return "cli";
		}
		const session = this.browserSession(request);
		if (mutation && !equal(request.headers.get("x-rac-csrf") ?? "", session.csrf)) denied("csrf_forbidden", 403);
		return "browser";
	}
	private browserSession(request: Request): { csrf: string; expires: number } {
		if (this.closed) denied();
		const cookies = (request.headers.get("cookie") ?? "")
			.split(";")
			.map((value) => value.trim())
			.filter((value) => value.startsWith(`${this.cookieName}=`));
		if (cookies.length !== 1) denied();
		const id = cookies[0]?.slice(this.cookieName.length + 1) ?? "";
		const session = this.sessions.get(id);
		if (!session || session.expires <= this.now()) {
			this.sessions.delete(id);
			denied();
		}
		return session;
	}
	csrf(request: Request): string {
		return this.browserSession(request).csrf;
	}

	issuePairing(request: Request): { code: string; expiresIn: number } {
		if (this.authorize(request, true) !== "cli") denied();
		this.pairing = { code: randomBytes(5).toString("hex").toUpperCase(), expires: this.now() + 120000, attempts: 0 };
		this.protectSecret(this.pairing.code, this.pairing.expires);
		return { code: this.pairing.code, expiresIn: 120 };
	}
	pair(code: unknown): { csrf: string; cookie: string } {
		if (this.closed || !this.pairing || this.pairing.expires <= this.now() || this.pairing.attempts++ >= 5) {
			this.pairing = undefined;
			denied("pairing_expired", 403);
		}
		if (typeof code !== "string" || !equal(code, this.pairing.code)) denied("pairing_invalid", 403);
		this.pairing = undefined;
		for (const [id, session] of this.sessions) if (session.expires <= this.now()) this.sessions.delete(id);
		if (this.sessions.size >= 32) denied("session_limit", 429);
		const id = secret();
		const csrf = secret();
		this.protectSecret(id, this.now() + 8 * 60 * 60 * 1000);
		this.protectSecret(csrf, this.now() + 8 * 60 * 60 * 1000);
		this.sessions.set(id, { csrf, expires: this.now() + 8 * 60 * 60 * 1000 });
		return { csrf, cookie: `${this.cookieName}=${id}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800` };
	}
	async close(): Promise<void> {
		this.closed = true;
		this.pairing = undefined;
		this.sessions.clear();
		if (this.descriptorPath) {
			try {
				const current = await readOwnerDescriptor(this.owner.canonicalRoot, dirname(dirname(this.descriptorPath)));
				if (current.generation === this.owner.generation) await rm(this.descriptorPath, { force: true });
			} catch {}
		}
	}
}

export async function callRacOwner(
	root: string,
	path: string,
	options: { method?: string; body?: unknown; key?: string; dataRoot?: string } = {},
): Promise<unknown> {
	if (!/^\/api\/rac\//.test(path)) throw new Error("Invalid RAC command path");
	const descriptor = await readOwnerDescriptor(root, options.dataRoot);
	const url = new URL(path, descriptor.url);
	const response = await fetch(url, {
		method: options.method ?? "GET",
		headers: {
			Authorization: `Bearer ${descriptor.secret}`,
			"X-RAC-Project": descriptor.projectKey,
			"X-RAC-Owner": descriptor.generation,
			Origin: url.origin,
			"Content-Type": "application/json",
			...(options.key ? { "Idempotency-Key": options.key } : {}),
		},
		...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
		redirect: "error",
		signal: AbortSignal.timeout(10000),
	});
	const value = (await response.json()) as {
		schemaVersion?: number;
		projectKey?: string;
		ownerGeneration?: string;
		error?: string;
		code?: string;
	};
	if (!response.ok)
		throw new LocalRequestError(
			typeof value.code === "string" ? value.code : "owner_error",
			typeof value.error === "string" ? value.error : "RAC owner rejected the command",
			response.status,
		);
	if (
		value.schemaVersion !== 1 ||
		value.projectKey !== descriptor.projectKey ||
		value.ownerGeneration !== descriptor.generation
	)
		throw new Error("RAC owner identity changed; retry explicitly");
	return value;
}
