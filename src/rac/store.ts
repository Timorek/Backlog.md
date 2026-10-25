import { Database } from "bun:sqlite";
import { createHash, randomUUID } from "node:crypto";
import { constants, lstatSync } from "node:fs";
import { chmod, mkdir, open, rename, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { canonicalTaskId, isValidTaskId } from "../utils/task-id.ts";
import type { RpcId } from "./codex-rpc.ts";
import { type RacOwner, resolveRacProject } from "./project-context.ts";
import { assertPrivateRacDirectory, racSettingsLocation } from "./project-settings.ts";
import {
	admitRun,
	isRunStatus,
	isTerminalRunStatus,
	RunStateError,
	recoverRun,
	resolveUnknownRun,
	transitionRun,
} from "./run-state.ts";
import {
	canonicalJson,
	type EventInput,
	type JsonValue,
	MAX_EVENT_BYTES,
	redactRacText,
	STORE_ERROR_CODES,
	type StoredErrorCode,
	sanitizedJson,
} from "./store-payload.ts";
import { migrateRacDatabase, RAC_APPLICATION_ID, RAC_MIGRATIONS } from "./store-schema.ts";
import {
	DEFAULT_STORE_LIMITS,
	type StoredEvent,
	type StoredInteraction,
	type StoredRun,
	type StoredSession,
	type StoreLimits,
} from "./store-types.ts";
import type { InteractionKind, InteractionStatus, RunStatus } from "./types.ts";

export class RacStoreError extends Error {
	constructor(
		readonly code: string,
		message: string,
		readonly status = 503,
		readonly fatal = false,
	) {
		super(message);
		this.name = "RacStoreError";
	}
}
type RunRow = StoredRun & {
	lastSequence: number;
	payloadBytes: number;
	logBytes: number;
	controlBytes: number;
	logTruncated: number;
};
type InteractionRow = Omit<StoredInteraction, "rpcRequestId" | "blocking"> & { rpcIdJson: string; blocking: number };
const terminalSql = "'interrupted','completed','failed','abandoned'";
const interactionKinds: readonly InteractionKind[] = [
	"question",
	"command_approval",
	"file_approval",
	"permission_approval",
	"mcp_elicitation",
];
const settledInteractions: readonly InteractionStatus[] = ["answered", "cleared", "expired", "stale"];
const hash = (value: string | Uint8Array) => createHash("sha256").update(value).digest("hex");
function invalid(message: string): never {
	throw new RacStoreError("invalid_input", message, 400);
}
function pageSize(value: number): number {
	if (!Number.isInteger(value) || value < 1 || value > 500) invalid("RAC page size must be between 1 and 500");
	return value;
}

export class RacStore {
	readonly owner: RacOwner;
	readonly limits: StoreLimits;
	private fenced = false;
	private closed = false;
	private depth = 0;
	private readonly inode: { dev: number; ino: number };
	private readonly secrets = new Map<string, number>();

	private constructor(
		private readonly db: Database,
		readonly path: string,
		owner: RacOwner,
		secrets: string[],
		limits: StoreLimits,
		private readonly now: () => number,
	) {
		for (const secret of secrets) this.secrets.set(secret, Number.POSITIVE_INFINITY);
		this.owner = Object.freeze(owner);
		this.limits = Object.freeze(limits);
		const info = lstatSync(path);
		this.inode = { dev: info.dev, ino: info.ino };
	}

	static async open(
		root: string,
		options: { dataRoot?: string; secrets?: readonly string[]; limits?: Partial<StoreLimits>; now?: () => number } = {},
	): Promise<RacStore> {
		if (process.platform === "win32")
			throw new RacStoreError("platform_unverified", "Native Windows RAC storage requires verified private ACLs");
		const project = await resolveRacProject(root);
		const directory = dirname(await racSettingsLocation(project, options.dataRoot));
		const limits = { ...DEFAULT_STORE_LIMITS, ...options.limits };
		if (
			Object.values(limits).some((value) => !Number.isSafeInteger(value) || value < 1) ||
			limits.controlBytes < 256 ||
			limits.projectBytes <= limits.controlBytes + 128
		)
			invalid("Invalid RAC history limits");
		const secrets = [...(options.secrets ?? [])];
		if (secrets.length > 128 || secrets.some((secret) => typeof secret !== "string" || secret.length > 16_384))
			invalid("Invalid configured redaction secrets");
		for (const path of [dirname(directory), directory]) {
			await mkdir(path, { recursive: true, mode: 0o700 });
			await assertPrivateRacDirectory(path);
		}
		const path = join(directory, "rac.sqlite");
		const file = await open(
			path,
			constants.O_RDWR | constants.O_CREAT | constants.O_NOFOLLOW | constants.O_NONBLOCK,
			0o600,
		);
		try {
			const info = await file.stat();
			if (!info.isFile() || info.nlink !== 1 || info.uid !== process.getuid?.() || (info.mode & 0o077) !== 0)
				throw new RacStoreError("private_file_required", "RAC database must be a private regular file");
		} finally {
			await file.close();
		}
		for (const suffix of ["-wal", "-shm", "-journal"]) {
			try {
				const info = lstatSync(`${path}${suffix}`);
				if (
					!info.isFile() ||
					info.isSymbolicLink() ||
					info.nlink !== 1 ||
					info.uid !== process.getuid?.() ||
					(info.mode & 0o077) !== 0
				)
					throw new RacStoreError("private_file_required", "RAC sidecars must be private regular files");
			} catch (error) {
				if (!error || typeof error !== "object" || !("code" in error) || error.code !== "ENOENT") throw error;
			}
		}
		let db: Database | undefined;
		try {
			db = new Database(path, { readwrite: true, create: false, strict: true });
			db.run("PRAGMA busy_timeout=100; PRAGMA foreign_keys=ON; PRAGMA locking_mode=EXCLUSIVE");
			db.run("BEGIN EXCLUSIVE");
			const version = (db.query("PRAGMA user_version").get() as { user_version: number }).user_version;
			if (version > RAC_MIGRATIONS.length)
				throw new RacStoreError("schema_newer", "RAC schema is newer than this application");
			const application = (db.query("PRAGMA application_id").get() as { application_id: number }).application_id;
			if (version > 0) {
				if (application !== RAC_APPLICATION_ID)
					throw new RacStoreError("schema_foreign", "Database does not belong to RAC");
				const existing = db
					.query<{ projectKey: string; canonicalRoot: string }, []>(
						"SELECT projectKey, canonicalRoot FROM project WHERE id=1",
					)
					.get();
				if (
					existing &&
					(existing.projectKey !== project.projectKey || existing.canonicalRoot !== project.canonicalRoot)
				)
					throw new RacStoreError("project_mismatch", "RAC database identity differs from the configured project");
			} else if (application !== 0 || db.query("SELECT name FROM sqlite_master WHERE name NOT LIKE 'sqlite_%'").get()) {
				throw new RacStoreError("schema_foreign", "Refusing to initialize a nonempty foreign database");
			}
			db.run(`PRAGMA user_version=${version}`);
			db.run("COMMIT");
			const mode = db.query("PRAGMA journal_mode=WAL").get() as { journal_mode: string };
			if (mode.journal_mode !== "wal") throw new RacStoreError("wal_required", "RAC requires WAL journal mode");
			db.run("PRAGMA synchronous=FULL");
			if (version < RAC_MIGRATIONS.length) {
				const backup = join(directory, `.rac-backup-${randomUUID()}.sqlite`);
				try {
					db.run("VACUUM INTO ?", [backup]);
					await chmod(backup, 0o600);
					const backupFile = await open(backup, constants.O_RDONLY | constants.O_NOFOLLOW);
					try {
						await backupFile.sync();
					} finally {
						await backupFile.close();
					}
					await rename(backup, join(directory, "rac.sqlite.backup"));
				} finally {
					await rm(backup, { force: true });
				}
				migrateRacDatabase(db);
			}
			const generation = randomUUID();
			db.transaction(() => {
				db?.run(
					"INSERT INTO project(id,projectKey,canonicalRoot,generation) VALUES (1,?,?,?) ON CONFLICT(id) DO UPDATE SET generation=excluded.generation",
					[project.projectKey, project.canonicalRoot, generation],
				);
			}).exclusive();
			const store = new RacStore(db, path, { ...project, generation }, secrets, limits, options.now ?? Date.now);
			store.recover();
			return store;
		} catch (error) {
			try {
				if (db?.inTransaction) db.run("ROLLBACK");
			} catch {}
			try {
				db?.close();
			} catch {}
			if (error instanceof RacStoreError) throw error;
			const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
			throw new RacStoreError(
				code === "SQLITE_BUSY" || code === "SQLITE_LOCKED" ? "store_owned" : "store_unavailable",
				"RAC store could not be opened; ordinary Backlog tasks remain available",
			);
		}
	}

	assertOwnership(): void {
		if (this.fenced || this.closed)
			throw new RacStoreError("owner_lost", "RAC store ownership is unavailable", 503, true);
		try {
			const file = lstatSync(this.path);
			const owner = this.db
				.query<{ generation: string; projectKey: string; canonicalRoot: string }, []>(
					"SELECT generation,projectKey,canonicalRoot FROM project WHERE id=1",
				)
				.get();
			if (
				!file.isFile() ||
				file.isSymbolicLink() ||
				file.nlink !== 1 ||
				file.dev !== this.inode.dev ||
				file.ino !== this.inode.ino ||
				file.uid !== process.getuid?.() ||
				(file.mode & 0o077) !== 0 ||
				owner?.generation !== this.owner.generation ||
				owner.projectKey !== this.owner.projectKey ||
				owner.canonicalRoot !== this.owner.canonicalRoot
			)
				throw new Error("owner identity");
		} catch {
			this.fenced = true;
			if (!this.depth) this.close();
			throw new RacStoreError("owner_lost", "RAC store ownership was lost; writes and starts are fenced", 503, true);
		}
	}
	private redactionSecrets(): string[] {
		for (const [value, expires] of this.secrets) if (expires <= this.now()) this.secrets.delete(value);
		return [...this.secrets.keys()];
	}
	registerRedactionSecret(value: string, expiresAt = Number.POSITIVE_INFINITY): void {
		this.assertOwnership();
		if (!value || value.length > 16_384 || !(expiresAt === Number.POSITIVE_INFINITY || Number.isSafeInteger(expiresAt)))
			invalid("Invalid RAC redaction secret");
		this.redactionSecrets();
		if (!this.secrets.has(value) && this.secrets.size >= 512)
			throw new RacStoreError("secret_limit", "Wait for expired local credentials before pairing again", 503);
		this.secrets.set(value, Math.max(this.secrets.get(value) ?? 0, expiresAt));
	}

	private write<T>(action: () => T): T {
		this.assertOwnership();
		this.depth++;
		try {
			return this.db
				.transaction(() => {
					const result = action();
					if (this.fenced) throw new RacStoreError("owner_lost", "RAC writes are fenced", 503, true);
					return result;
				})
				.immediate();
		} catch (error) {
			return this.failure(error);
		} finally {
			this.depth--;
			if (this.fenced && !this.depth) this.close();
		}
	}
	private failure(error: unknown): never {
		if (!(error instanceof RunStateError) && (!(error instanceof RacStoreError) || error.fatal)) this.fenced = true;
		if (this.fenced && !this.depth) this.close();
		if (error instanceof RunStateError || error instanceof RacStoreError) throw error;
		throw new RacStoreError("store_unavailable", "RAC persistence failed; execution must stop", 503, true);
	}
	private read<T>(action: () => T): T {
		this.assertOwnership();
		try {
			return action();
		} catch (error) {
			return this.failure(error);
		}
	}
	private id(value: string): string {
		if (
			typeof value !== "string" ||
			!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/.test(value) ||
			redactRacText(value, this.redactionSecrets()) !== value
		)
			invalid("Invalid or sensitive RAC identifier");
		return value;
	}
	private run(id: string, currentOwner = true): RunRow {
		const row = this.db.query<RunRow, [string]>("SELECT * FROM runs WHERE id=?").get(this.id(id));
		if (!row) {
			const expired = Boolean(this.db.query("SELECT id FROM expired_runs WHERE id=?").get(id));
			throw new RacStoreError(
				expired ? "history_expired" : "run_not_found",
				"RAC run is unavailable",
				expired ? 410 : 404,
			);
		}
		if (row.projectKey !== this.owner.projectKey || !isRunStatus(row.status))
			throw new RacStoreError("data_corrupt", "Invalid RAC run data", 503, true);
		if (currentOwner && row.ownerGeneration !== this.owner.generation)
			throw new RacStoreError("stale_generation", "Run belongs to a previous owner generation", 409);
		return row;
	}
	private publicRun(row: RunRow): StoredRun {
		const {
			id,
			projectKey,
			taskId,
			taskCreatedAt,
			taskRevision,
			sessionId,
			ownerGeneration,
			status,
			startedAt,
			finishedAt,
			errorCode,
			turnId,
		} = row;
		return {
			id,
			projectKey,
			taskId,
			taskCreatedAt,
			taskRevision,
			sessionId,
			ownerGeneration,
			status,
			startedAt,
			finishedAt,
			errorCode,
			turnId,
		};
	}
	private totalBytes(): number {
		return (this.db.query("SELECT COALESCE(SUM(payloadBytes),0) AS total FROM runs").get() as { total: number }).total;
	}
	private payload(value: unknown): string {
		try {
			return sanitizedJson(value, this.redactionSecrets());
		} catch {
			return invalid("RAC payload is invalid, too large or contains credential fields");
		}
	}
	private event(run: RunRow, kind: string, value: unknown, log = false): StoredEvent {
		const payload = this.payload(value);
		const bytes = Buffer.byteLength(payload);
		if (bytes > MAX_EVENT_BYTES) invalid("RAC event exceeds 64 KiB");
		const controlLimit = this.limits.controlBytes - (kind === "state" ? 0 : 128);
		if (!log && (run.controlBytes + bytes > controlLimit || this.totalBytes() + bytes > this.limits.projectBytes))
			throw new RacStoreError(
				"audit_capacity_exhausted",
				"RAC audit reserve exhausted; execution must stop",
				503,
				true,
			);
		const sequence = run.lastSequence + 1;
		const timestamp = this.now();
		this.db.run("INSERT INTO events VALUES (?,?,?,?,1,?)", [run.id, sequence, timestamp, kind, payload]);
		this.db.run(
			"UPDATE runs SET lastSequence=?,payloadBytes=payloadBytes+?,logBytes=logBytes+?,controlBytes=controlBytes+? WHERE id=?",
			[sequence, bytes, log ? bytes : 0, log ? 0 : bytes, run.id],
		);
		return { runId: run.id, sequence, timestamp, kind, payloadVersion: 1, payload: JSON.parse(payload) };
	}
	private recover(): void {
		this.write(() => {
			this.db.run("UPDATE interactions SET status='uncertain' WHERE status='open'");
			const runs = this.db.query<RunRow, []>(`SELECT * FROM runs WHERE status NOT IN (${terminalSql})`).all();
			for (const run of runs) {
				const recovered = recoverRun(run);
				this.db.run("UPDATE runs SET status=? WHERE id=?", [recovered.status, run.id]);
				if (run.status !== "unknown") this.event(run, "state", { status: "unknown", reason: "owner_restart" });
			}
		});
	}

	createSession(input: { id?: string; threadId?: string; protocolVersion: string }): StoredSession {
		return this.write(() => {
			const id = this.id(input.id ?? randomUUID());
			const threadId = input.threadId ? this.id(input.threadId) : null;
			if (this.db.query("SELECT id FROM sessions WHERE id=? OR threadId=?").get(id, threadId))
				throw new RacStoreError("session_exists", "RAC session identity already exists", 409);
			const value: StoredSession = {
				id,
				projectKey: this.owner.projectKey,
				provider: "codex",
				threadId,
				currentTurnId: null,
				protocolVersion: this.id(input.protocolVersion),
				createdAt: this.now(),
			};
			this.db.run("INSERT INTO sessions VALUES (?,?,?,?,?,?,?)", [
				value.id,
				value.projectKey,
				value.provider,
				value.threadId,
				value.currentTurnId,
				value.protocolVersion,
				value.createdAt,
			]);
			return value;
		});
	}
	getSession(id: string): StoredSession | null {
		return this.read(() => {
			return this.db.query<StoredSession, [string]>("SELECT * FROM sessions WHERE id=?").get(this.id(id));
		});
	}
	bindThread(sessionId: string, threadId: string): StoredSession {
		return this.write(() => {
			const session = this.getSession(sessionId);
			const thread = this.id(threadId);
			if (!session) throw new RacStoreError("session_not_found", "RAC session does not exist", 404);
			if (session.threadId && session.threadId !== thread)
				throw new RacStoreError("thread_conflict", "Session is already bound to another thread", 409);
			if (this.db.query("SELECT id FROM sessions WHERE threadId=? AND id<>?").get(thread, sessionId))
				throw new RacStoreError("thread_conflict", "Thread is already bound to another session", 409);
			this.db.run("UPDATE sessions SET threadId=? WHERE id=?", [thread, sessionId]);
			return this.getSession(sessionId) as StoredSession;
		});
	}
	reserveRun(input: {
		id?: string;
		taskId: string;
		taskCreatedAt: string;
		rawTask: string | Uint8Array;
		sessionId: string;
	}): StoredRun {
		return this.write(() => {
			if (
				!isValidTaskId(input.taskId) ||
				!/^[A-Za-z]+-/.test(input.taskId) ||
				!Number.isFinite(Date.parse(input.taskCreatedAt))
			)
				invalid("RAC task identity is invalid");
			if (!this.getSession(input.sessionId))
				throw new RacStoreError("session_not_found", "RAC session does not exist", 404);
			const candidate: StoredRun = {
				id: this.id(input.id ?? randomUUID()),
				projectKey: this.owner.projectKey,
				taskId: this.id(canonicalTaskId(input.taskId)),
				taskCreatedAt: input.taskCreatedAt,
				taskRevision: hash(input.rawTask),
				sessionId: input.sessionId,
				ownerGeneration: this.owner.generation,
				status: "starting",
				startedAt: this.now(),
				finishedAt: null,
				errorCode: null,
				turnId: null,
			};
			if (this.db.query("SELECT id FROM expired_runs WHERE id=?").get(candidate.id))
				throw new RacStoreError("run_exists", "Run identity was previously retired", 409);
			const contenders = this.db
				.query<RunRow, [string]>(`SELECT * FROM runs WHERE id=? OR status NOT IN (${terminalSql})`)
				.all(candidate.id);
			admitRun(contenders, candidate);
			this.pruneInternal(this.limits.controlBytes + 128, input.sessionId);
			if (this.totalBytes() + this.limits.controlBytes + 128 > this.limits.projectBytes)
				throw new RacStoreError("history_full", "Protected RAC history leaves no audit reserve for a new run", 503);
			this.db.run(
				"INSERT INTO runs(id,projectKey,taskId,taskCreatedAt,taskRevision,sessionId,ownerGeneration,status,startedAt) VALUES (?,?,?,?,?,?,?,?,?)",
				[
					candidate.id,
					candidate.projectKey,
					candidate.taskId,
					candidate.taskCreatedAt,
					candidate.taskRevision,
					candidate.sessionId,
					candidate.ownerGeneration,
					candidate.status,
					candidate.startedAt,
				],
			);
			this.event(this.run(candidate.id), "state", { status: "starting" });
			return this.getRun(candidate.id);
		});
	}
	getRun(id: string): StoredRun {
		return this.read(() => {
			return this.publicRun(this.run(id, false));
		});
	}
	listTaskRuns(taskId: string, options: { taskCreatedAt?: string; limit?: number; offset?: number } = {}): StoredRun[] {
		return this.read(() => {
			if (!isValidTaskId(taskId) || !/^[A-Za-z]+-/.test(taskId)) invalid("Use a fully qualified task ID");
			const offset = options.offset ?? 0;
			if (!Number.isSafeInteger(offset) || offset < 0) invalid("Invalid history offset");
			return this.db
				.query<RunRow, [string, string | null, string | null, number, number]>(
					"SELECT * FROM runs WHERE taskId=? AND (? IS NULL OR taskCreatedAt=?) ORDER BY startedAt DESC,id DESC LIMIT ? OFFSET ?",
				)
				.all(
					canonicalTaskId(taskId),
					options.taskCreatedAt ?? null,
					options.taskCreatedAt ?? null,
					pageSize(options.limit ?? 100),
					offset,
				)
				.map((row) => this.publicRun(row));
		});
	}
	setRunStatus(id: string, status: RunStatus, errorCode?: StoredErrorCode): StoredRun {
		return this.write(() => {
			const run = this.run(id);
			if (errorCode && !STORE_ERROR_CODES.includes(errorCode)) invalid("Invalid sanitized error code");
			transitionRun(run, status, this.listInteractions(id));
			if (status === run.status) return this.publicRun(run);
			this.db.run("UPDATE runs SET status=?,finishedAt=?,errorCode=? WHERE id=?", [
				status,
				isTerminalRunStatus(status) ? this.now() : null,
				errorCode ?? null,
				id,
			]);
			if (isTerminalRunStatus(status))
				this.db.run("UPDATE sessions SET currentTurnId=NULL WHERE id=?", [run.sessionId]);
			this.event(run, "state", { status, ...(errorCode ? { code: errorCode } : {}) });
			return this.getRun(id);
		});
	}
	resolveRun(id: string, previousProcessStopped: boolean): StoredRun {
		return this.write(() => {
			const run = this.run(id, false);
			if (previousProcessStopped !== true) resolveUnknownRun(run, false);
			if (run.status !== "unknown" && !isTerminalRunStatus(run.status))
				throw new RacStoreError("run_not_resolvable", "Only an unknown or terminal run can be resolved", 409);
			const pending = this.listInteractions(id).some((item) => item.status === "open" || item.status === "uncertain");
			if (run.status !== "unknown" && !pending) return this.publicRun(run);
			const status = run.status === "unknown" ? resolveUnknownRun(run, true).status : run.status;
			if (run.status === "unknown")
				this.db.run("UPDATE runs SET status=?,finishedAt=? WHERE id=?", [status, this.now(), id]);
			this.db.run(
				"UPDATE interactions SET status='stale',resolvedAt=? WHERE runId=? AND status IN ('open','uncertain')",
				[this.now(), id],
			);
			if (run.status === "unknown") this.db.run("UPDATE sessions SET currentTurnId=NULL WHERE id=?", [run.sessionId]);
			this.event(run, "state", { status, reason: "human_resolution" });
			return this.getRun(id);
		});
	}

	bindTurn(runId: string, turnId: string | null): StoredRun {
		return this.write(() => {
			const run = this.run(runId);
			const session = this.getSession(run.sessionId);
			if (isTerminalRunStatus(run.status) || run.status === "unknown" || !session?.threadId)
				throw new RacStoreError("turn_scope", "Cannot bind a turn outside an active Codex session", 409);
			if (turnId !== null) this.id(turnId);
			if (session.currentTurnId && turnId && session.currentTurnId !== turnId)
				throw new RacStoreError("turn_active", "Another turn is still active", 409);
			if (session.currentTurnId === turnId) return this.publicRun(run);
			this.db.run("UPDATE sessions SET currentTurnId=? WHERE id=?", [turnId, session.id]);
			if (turnId) this.db.run("UPDATE runs SET turnId=? WHERE id=?", [turnId, runId]);
			this.event(run, "turn", { threadId: session.threadId, turnId, state: turnId ? "started" : "finished" });
			return this.getRun(runId);
		});
	}
	listInteractions(runId: string): StoredInteraction[] {
		return this.read(() => {
			this.run(runId, false);
			return this.db
				.query<InteractionRow, [string]>("SELECT * FROM interactions WHERE runId=? ORDER BY openedAt,id")
				.all(runId)
				.map(({ rpcIdJson, blocking, ...row }) => ({
					...row,
					blocking: blocking === 1,
					rpcRequestId: JSON.parse(rpcIdJson),
				}));
		});
	}
	createInteraction(input: {
		id?: string;
		runId: string;
		kind: InteractionKind;
		blocking: boolean;
		rpcRequestId: RpcId;
		threadId: string;
		turnId: string;
		itemId?: string;
		expiresAt: number;
	}): StoredInteraction {
		return this.write(() => {
			const run = this.run(input.runId);
			const session = this.getSession(run.sessionId);
			if (
				isTerminalRunStatus(run.status) ||
				run.status === "unknown" ||
				session?.threadId !== input.threadId ||
				session.currentTurnId !== input.turnId
			)
				throw new RacStoreError("interaction_scope", "Interaction does not match the active run/thread/turn", 409);
			if (
				!interactionKinds.includes(input.kind) ||
				typeof input.blocking !== "boolean" ||
				!Number.isSafeInteger(input.expiresAt) ||
				input.expiresAt <= this.now()
			)
				invalid("Invalid interaction metadata");
			if (typeof input.rpcRequestId === "string") {
				if (
					input.rpcRequestId.length > 1024 ||
					redactRacText(input.rpcRequestId, this.redactionSecrets()) !== input.rpcRequestId
				)
					invalid("Invalid or sensitive RPC request ID");
			} else if (!Number.isSafeInteger(input.rpcRequestId)) invalid("Invalid RPC request ID");
			const id = this.id(input.id ?? randomUUID());
			if (
				this.db
					.query("SELECT id FROM interactions WHERE id=? OR (runId=? AND ownerGeneration=? AND rpcIdJson=?)")
					.get(id, run.id, this.owner.generation, JSON.stringify(input.rpcRequestId))
			)
				throw new RacStoreError("interaction_exists", "Interaction request identity already exists", 409);
			this.db.run("INSERT INTO interactions VALUES (?,?,?,?,?,?,?,?,?,?,?,?,NULL)", [
				id,
				run.id,
				this.owner.generation,
				input.kind,
				input.blocking ? 1 : 0,
				"open",
				JSON.stringify(input.rpcRequestId),
				this.id(input.threadId),
				this.id(input.turnId),
				input.itemId ? this.id(input.itemId) : null,
				this.now(),
				input.expiresAt,
			]);
			this.event(run, "interaction", { interactionId: id, kind: input.kind, status: "open", blocking: input.blocking });
			return this.listInteractions(run.id).find((row) => row.id === id) as StoredInteraction;
		});
	}
	settleInteraction(runId: string, interactionId: string, status: InteractionStatus): StoredInteraction {
		return this.write(() => {
			const run = this.run(runId);
			if (!settledInteractions.includes(status)) invalid("Invalid interaction resolution");
			if (status === "answered" && run.status !== "running")
				throw new RacStoreError("interaction_stale", "Only a running run can accept an interaction answer", 409);
			const item = this.listInteractions(runId).find((row) => row.id === this.id(interactionId));
			if (!item || item.ownerGeneration !== this.owner.generation || item.status !== "open")
				throw new RacStoreError("interaction_stale", "Interaction is not open in this owner generation", 409);
			this.db.run("UPDATE interactions SET status=?,resolvedAt=? WHERE id=?", [status, this.now(), interactionId]);
			this.event(run, "interaction", { interactionId, status });
			return this.listInteractions(runId).find((row) => row.id === interactionId) as StoredInteraction;
		});
	}
	private truncation(run: RunRow, reason: string): StoredEvent | null {
		if (this.db.query("SELECT 1 FROM events WHERE runId=? AND kind='truncated' LIMIT 1").get(run.id)) return null;
		return this.event(run, "truncated", { reason });
	}
	appendEvent(runId: string, input: EventInput): { event: StoredEvent | null; truncated: boolean } {
		return this.write(() => {
			const run = this.run(runId);
			if (isTerminalRunStatus(run.status) || run.status === "unknown")
				throw new RacStoreError("run_not_active", "Cannot append to a finished or unknown run", 409);
			let value: Record<string, unknown>;
			let shortened = false;
			if (input.kind === "text" || input.kind === "agent_message" || input.kind === "user_message") {
				if (typeof input.text !== "string") invalid("Invalid event text");
				if (Object.keys(input).some((key) => !["kind", "text", "itemId"].includes(key)))
					invalid("Unexpected event payload fields");
				value = {
					text: redactRacText(input.text, this.redactionSecrets()),
					...(input.kind === "text" ? {} : { sessionId: run.sessionId }),
					...("itemId" in input && input.itemId ? { itemId: this.id(input.itemId) } : {}),
				};
			} else if (input.kind === "error" && STORE_ERROR_CODES.includes(input.code) && Object.keys(input).length === 2)
				value = { code: input.code };
			else return invalid("Unsupported RAC event payload");
			if (typeof value.text === "string" && Buffer.byteLength(JSON.stringify(value)) > MAX_EVENT_BYTES) {
				const text = value.text;
				let low = 0;
				let high = text.length;
				while (low < high) {
					const middle = Math.ceil((low + high) / 2);
					if (Buffer.byteLength(JSON.stringify({ ...value, text: text.slice(0, middle) })) <= MAX_EVENT_BYTES)
						low = middle;
					else high = middle - 1;
				}
				value.text = text.slice(0, low).replace(/[\uD800-\uDBFF]$/, "");
				shortened = true;
			}
			const bytes = Buffer.byteLength(this.payload(value));
			if (input.kind === "text") {
				if (run.logTruncated) return { event: null, truncated: true };
				const remainingReserve = Math.max(0, this.limits.controlBytes - run.controlBytes);
				if (
					run.logBytes + bytes > this.limits.runLogBytes ||
					this.totalBytes() + bytes + remainingReserve > this.limits.projectBytes
				) {
					const event = this.truncation(run, "log_limit");
					this.db.run("UPDATE runs SET logTruncated=1 WHERE id=?", [runId]);
					return { event, truncated: true };
				}
			}
			const event = this.event(run, input.kind, value, input.kind === "text");
			if (shortened) this.truncation(this.run(runId), "event_limit");
			return { event, truncated: shortened };
		});
	}
	listEvents(runId: string, after = 0, limit = 100): { events: StoredEvent[]; nextAfter: number; hasMore: boolean } {
		return this.read(() => {
			this.run(runId, false);
			if (!Number.isSafeInteger(after) || after < 0) invalid("Invalid event cursor");
			pageSize(limit);
			const rows = this.db
				.query<Omit<StoredEvent, "payload"> & { payload: string }, [string, number, number]>(
					"SELECT * FROM events WHERE runId=? AND sequence>? ORDER BY sequence LIMIT ?",
				)
				.all(runId, after, limit + 1);
			const events = rows.slice(0, limit).map((row) => ({ ...row, payload: JSON.parse(row.payload) as JsonValue }));
			return { events, nextAfter: events.at(-1)?.sequence ?? after, hasMore: rows.length > limit };
		});
	}
	idempotent(
		operation: "start" | "cancel" | "resume" | "resolve" | "message" | "answer" | "decide",
		resourceId: string,
		key: string,
		request: unknown,
		action: () => JsonValue,
	): { value: JsonValue; replayed: boolean } {
		return this.write(() => {
			if (
				!["start", "cancel", "resume", "resolve", "message", "answer", "decide"].includes(operation) ||
				typeof key !== "string" ||
				!key ||
				Buffer.byteLength(key) > 512
			)
				invalid("Invalid idempotency identity");
			this.id(resourceId);
			let inputHash: string;
			try {
				inputHash = hash(canonicalJson(request));
			} catch {
				return invalid("Invalid idempotency request");
			}
			const keyHash = hash(key);
			const stored = this.db
				.query<{ inputHash: string; result: string }, [string, string, string]>(
					"SELECT inputHash,result FROM idempotency WHERE operation=? AND resourceId=? AND keyHash=?",
				)
				.get(operation, resourceId, keyHash);
			if (stored) {
				if (stored.inputHash !== inputHash)
					throw new RacStoreError("idempotency_conflict", "Idempotency key was reused with different input", 409);
				return { value: JSON.parse(stored.result), replayed: true };
			}
			const value = action();
			if (value && typeof value === "object" && "then" in value) {
				void Promise.resolve(value).catch(() => {});
				throw new RacStoreError(
					"async_transaction",
					"Idempotency callbacks must be synchronous database operations",
					503,
					true,
				);
			}
			const result = this.payload(value);
			this.db.run("INSERT INTO idempotency VALUES (?,?,?,?,?,?,?)", [
				this.owner.projectKey,
				operation,
				resourceId,
				keyHash,
				inputHash,
				result,
				this.now(),
			]);
			return { value: JSON.parse(result), replayed: false };
		});
	}
	private pruneInternal(requiredBytes = 0, keepSessionId?: string): string[] {
		const rows = this.db
			.query<{ id: string; sessionId: string; finishedAt: number; payloadBytes: number }, []>(
				`SELECT id,sessionId,finishedAt,payloadBytes FROM runs r WHERE status IN (${terminalSql}) AND NOT EXISTS(SELECT 1 FROM interactions i WHERE i.runId=r.id AND i.status IN ('open','uncertain')) ORDER BY finishedAt,id`,
			)
			.all();
		let total = this.totalBytes();
		const removed: string[] = [];
		for (const row of rows) {
			if (row.finishedAt >= this.now() - this.limits.retentionMs && total + requiredBytes <= this.limits.projectBytes)
				continue;
			this.db.run("INSERT INTO expired_runs VALUES (?,?)", [row.id, this.now()]);
			this.db.run("DELETE FROM runs WHERE id=?", [row.id]);
			total -= row.payloadBytes;
			removed.push(row.id);
			if (row.sessionId !== keepSessionId)
				this.db.run("DELETE FROM sessions WHERE id=? AND NOT EXISTS(SELECT 1 FROM runs WHERE sessionId=?)", [
					row.sessionId,
					row.sessionId,
				]);
		}
		return removed;
	}
	pruneHistory(): string[] {
		return this.write(() => this.pruneInternal());
	}
	close(): void {
		if (!this.closed) {
			this.closed = true;
			try {
				this.db.close();
			} catch {}
		}
	}
}
