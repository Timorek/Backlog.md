import { Database } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { chmod, lstat, mkdir, mkdtemp, readFile, realpath, rename, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { FileSystem } from "../file-system/operations.ts";
import { RacStore, RacStoreError } from "../rac/store.ts";
import type { EventInput, JsonValue } from "../rac/store-payload.ts";
import { migrateRacDatabase } from "../rac/store-schema.ts";
import { BacklogServer } from "../server/index.ts";

describe.skipIf(process.platform === "win32")("RAC private SQLite store", () => {
	let base: string;
	let root: string;
	let dataRoot: string;
	let store: RacStore;
	let clock: number;
	beforeEach(async () => {
		base = await realpath(await mkdtemp(join(tmpdir(), "rac-store-")));
		root = join(base, "project");
		dataRoot = join(base, "data");
		await mkdir(root);
		clock = Date.parse("2026-10-24T12:00:00Z");
		store = await RacStore.open(root, { dataRoot, now: () => clock });
	});
	afterEach(async () => {
		store.close();
		await rm(base, { recursive: true, force: true });
	});
	function reserve(id = "run-1", sessionId = "session-1", taskCreatedAt = "2026-10-24T00:00:00Z") {
		return store.reserveRun({
			id,
			sessionId,
			taskId: "back-000796",
			taskCreatedAt,
			rawTask: "---\r\nid: BACK-796\r\n---\r\noriginal raw task",
		});
	}
	function session(id = "session-1") {
		return store.createSession({ id, threadId: `thread-${id}`, protocolVersion: "0.162.1" });
	}
	function running() {
		session();
		reserve();
		store.setRunStatus("run-1", "running");
		store.bindTurn("run-1", "turn-1");
	}
	function completed(id = "run-1", sessionId = "session-1") {
		session(sessionId);
		reserve(id, sessionId);
		store.setRunStatus(id, "running");
		store.setRunStatus(id, "completed");
	}

	test("private SQLite/WAL and a consistent pre-migration backup are outside the checkout", async () => {
		expect(store.path.startsWith(dataRoot)).toBe(true);
		expect((await lstat(store.path)).mode & 0o777).toBe(0o600);
		expect((await lstat(dirname(store.path))).mode & 0o777).toBe(0o700);
		const backupPath = join(dirname(store.path), "rac.sqlite.backup");
		expect((await lstat(backupPath)).mode & 0o777).toBe(0o600);
		const backup = new Database(backupPath);
		try {
			expect(backup.query("PRAGMA integrity_check").get()).toEqual({ integrity_check: "ok" });
			expect(backup.query("PRAGMA user_version").get()).toEqual({ user_version: 0 });
		} finally {
			backup.close();
		}
		const native = (store as unknown as { db: Database }).db;
		expect(native.query("PRAGMA user_version").get()).toEqual({ user_version: 1 });
		expect(native.query("PRAGMA foreign_keys").get()).toEqual({ foreign_keys: 1 });
		expect(native.query("PRAGMA journal_mode").get()).toEqual({ journal_mode: "wal" });
		expect(native.query("PRAGMA locking_mode").get()).toEqual({ locking_mode: "exclusive" });
	});

	test("run/session identity and exact raw task revision survive reopen without modifying Markdown", async () => {
		session();
		const run = reserve();
		expect(run.taskId).toBe("BACK-796");
		expect(run.taskRevision).toBe(
			createHash("sha256").update("---\r\nid: BACK-796\r\n---\r\noriginal raw task").digest("hex"),
		);
		store.setRunStatus(run.id, "running");
		store.appendEvent(run.id, { kind: "agent_message", text: "finished" });
		store.setRunStatus(run.id, "completed");
		const originalGeneration = store.owner.generation;
		const path = store.path;
		store.close();
		store = await RacStore.open(root, { dataRoot, now: () => clock });
		expect(store.path).toBe(path);
		expect(store.owner.generation).not.toBe(originalGeneration);
		expect(store.getRun(run.id).status).toBe("completed");
		expect(store.getSession(run.sessionId)?.threadId).toBe("thread-session-1");
		expect(store.listEvents(run.id).events.map((event) => event.kind)).toEqual([
			"state",
			"state",
			"agent_message",
			"state",
		]);
		await expect(readFile(join(root, "backlog", "config.yml"))).rejects.toThrow();
	});

	test("single slot includes unknown runs; recovery fences old events and does not auto-resume", async () => {
		running();
		store.createInteraction({
			id: "interaction",
			runId: "run-1",
			kind: "question",
			blocking: true,
			rpcRequestId: 0,
			threadId: "thread-session-1",
			turnId: "turn-1",
			expiresAt: clock + 10000,
		});
		session("session-2");
		expect(() => reserve("run-2", "session-2")).toThrow("active");
		store.close();
		store = await RacStore.open(root, { dataRoot, now: () => clock });
		expect(store.getRun("run-1").status).toBe("unknown");
		expect(store.listInteractions("run-1")[0]?.status).toBe("uncertain");
		expect(() => reserve("run-2", "session-2")).toThrow("active");
		expect(() => store.appendEvent("run-1", { kind: "text", text: "stale" })).toThrow("previous owner");
		expect(() => store.resolveUnknown("run-1", false)).toThrow("confirmed stopped");
		const before = store.listEvents("run-1").events.length;
		store.close();
		store = await RacStore.open(root, { dataRoot, now: () => clock });
		expect(store.listEvents("run-1").events).toHaveLength(before);
		store.resolveUnknown("run-1", true);
		expect(store.getRun("run-1").status).toBe("abandoned");
		expect(reserve("run-2", "session-2").status).toBe("starting");
	});

	test("history groups canonical IDs and distinguishes reused task identities", () => {
		completed();
		clock++;
		session("session-2");
		reserve("run-2", "session-2", "2026-10-25T00:00:00Z");
		expect(store.listTaskRuns("BACK-000796").map((run) => run.id)).toEqual(["run-2", "run-1"]);
		expect(store.listTaskRuns("back-796", { taskCreatedAt: "2026-10-24T00:00:00Z" }).map((run) => run.id)).toEqual([
			"run-1",
		]);
		expect(store.listTaskRuns("BACK-796", { limit: 1, offset: 1 })[0]?.id).toBe("run-1");
	});

	test("interaction IDs preserve number/string types, scope and blocking completion", () => {
		running();
		for (const [id, rpcRequestId] of [
			["number", 0],
			["string", "0"],
			["empty", ""],
		] as const)
			store.createInteraction({
				id,
				runId: "run-1",
				kind: "command_approval",
				blocking: true,
				rpcRequestId,
				threadId: "thread-session-1",
				turnId: "turn-1",
				expiresAt: clock + 10000,
			});
		expect(
			store
				.listInteractions("run-1")
				.map((item) => item.rpcRequestId)
				.sort((a, b) => String(a).localeCompare(String(b))),
		).toEqual(["", 0, "0"]);
		expect(() => store.setRunStatus("run-1", "completed")).toThrow("blocking");
		expect(() =>
			store.createInteraction({
				runId: "run-1",
				kind: "question",
				blocking: true,
				rpcRequestId: 4,
				threadId: "foreign",
				turnId: "turn-1",
				expiresAt: clock + 10000,
			}),
		).toThrow("match");
		for (const id of ["number", "string", "empty"]) store.settleInteraction("run-1", id, "answered");
		expect(() => store.settleInteraction("run-1", "number", "answered")).toThrow("not open");
		store.setRunStatus("run-1", "completed");
	});

	test("one idempotency table atomically reserves mutations, replays and rejects changed input", () => {
		let calls = 0;
		const act = (): JsonValue => {
			calls++;
			session();
			const run = reserve();
			return { runId: run.id, status: run.status };
		};
		const first = store.idempotent("start", "BACK-796", "key-1", { b: 2, a: 1 }, act);
		expect(first).toEqual({ value: { runId: "run-1", status: "starting" }, replayed: false });
		expect(store.idempotent("start", "BACK-796", "key-1", { a: 1, b: 2 }, act)).toEqual({ ...first, replayed: true });
		expect(calls).toBe(1);
		expect(() => store.idempotent("start", "BACK-796", "key-1", { a: 2 }, act)).toThrow("different input");
		const native = (store as unknown as { db: Database }).db;
		expect(native.query("SELECT name FROM sqlite_master WHERE name IN ('messages','migrations')").all()).toEqual([]);
	});

	test("idempotency rollback leaves no run/session/receipt and no raw request secret", () => {
		expect(() =>
			store.idempotent("start", "BACK-796", "raw-key-secret", { token: "SYNTHETIC_REQUEST_SECRET" }, () => {
				session();
				reserve();
				throw new RacStoreError("rejected", "validation failed", 409);
			}),
		).toThrow("validation failed");
		expect(store.getSession("session-1")).toBeNull();
		expect(store.listTaskRuns("BACK-796")).toEqual([]);
		store.idempotent("start", "BACK-796", "raw-key-secret", { token: "SYNTHETIC_REQUEST_SECRET" }, () => ({
			accepted: true,
		}));
		const native = (store as unknown as { db: Database }).db;
		const rows = JSON.stringify(native.query("SELECT * FROM idempotency").all());
		expect(rows).not.toContain("SYNTHETIC_REQUEST_SECRET");
		expect(rows).not.toContain("raw-key-secret");
	});

	test("logs redact credential formats and configured secrets; raw payload fields are refused", async () => {
		store.close();
		store = await RacStore.open(root, { dataRoot, secrets: ["SYNTHETIC_EXACT_SECRET"] });
		running();
		store.appendEvent("run-1", {
			kind: "text",
			text: 'SYNTHETIC_EXACT_SECRET sk-proj-Abcdefghijklmnop ghp_Abcdefghijklmnop Bearer some-token password=very-private https://user:pass@example.test "token":"json-secret"',
		});
		const text = JSON.stringify(store.listEvents("run-1"));
		for (const secret of [
			"SYNTHETIC_EXACT_SECRET",
			"sk-proj-Abcdefghijklmnop",
			"ghp_Abcdefghijklmnop",
			"some-token",
			"very-private",
			"user:pass",
			"json-secret",
		])
			expect(text).not.toContain(secret);
		expect(text).toContain("REDACTED");
		expect(() =>
			store.appendEvent("run-1", { kind: "text", text: "x", token: "bad" } as unknown as EventInput),
		).toThrow("Unexpected");
		expect(() => store.idempotent("message", "run-1", "key", {}, () => ({ token: "bad" }))).toThrow("credential");
	});

	test("migrations roll back schema and user_version together and are repeatable", () => {
		const db = new Database(":memory:");
		try {
			expect(() =>
				migrateRacDatabase(db, [{ version: 1, sql: "CREATE TABLE partial(id); INSERT INTO missing VALUES(1);" }]),
			).toThrow();
			expect(db.query("PRAGMA user_version").get()).toEqual({ user_version: 0 });
			expect(db.query("SELECT name FROM sqlite_master WHERE name='partial'").get()).toBeNull();
			migrateRacDatabase(db);
			migrateRacDatabase(db);
			expect(db.query("PRAGMA user_version").get()).toEqual({ user_version: 1 });
		} finally {
			db.close();
		}
	});

	test("a newer schema is rejected without changing its version or data", async () => {
		const path = store.path;
		store.close();
		const db = new Database(path);
		db.run("PRAGMA user_version=99");
		db.run("CREATE TABLE future_data(value)");
		db.run("INSERT INTO future_data VALUES ('preserve-me')");
		db.close();
		await expect(RacStore.open(root, { dataRoot })).rejects.toThrow("newer");
		await new FileSystem(root).ensureBacklogStructure();
		const server = new BacklogServer(root);
		try {
			const response = await (
				server as unknown as { handleUpdateConfig(request: Request): Promise<Response> }
			).handleUpdateConfig(
				new Request("http://127.0.0.1/api/config", {
					method: "PUT",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({
						projectName: "Ordinary Backlog",
						statuses: ["To Do", "In Progress", "Done"],
						labels: [],
						milestones: [],
					}),
				}),
			);
			expect(response.status).toBe(200);
			expect(await readFile(join(root, "backlog", "config.yml"), "utf8")).toContain("Ordinary Backlog");
		} finally {
			await server.stop();
		}

		const read = new Database(path);
		try {
			expect(read.query("PRAGMA user_version").get()).toEqual({ user_version: 99 });
			expect(read.query("SELECT * FROM future_data").get()).toEqual({ value: "preserve-me" });
		} finally {
			read.close();
		}
	});

	test("one connection owns actual exclusive locks until close", async () => {
		await expect(RacStore.open(root, { dataRoot })).rejects.toMatchObject({ code: "store_owned" });
		store.assertOwnership();
		const generation = store.owner.generation;
		store.close();
		store = await RacStore.open(root, { dataRoot });
		expect(store.owner.generation).not.toBe(generation);
	});

	test("generation changes and file replacement fence every later start and write", async () => {
		session();
		reserve();
		const path = store.path;
		const native = (store as unknown as { db: Database }).db;
		native.run("UPDATE project SET generation='foreign'");
		expect(() => store.setRunStatus("run-1", "running")).toThrow("ownership");
		expect(() => store.createSession({ protocolVersion: "0.162.1" })).toThrow("ownership");
		store = await RacStore.open(root, { dataRoot });
		await rename(path, `${path}.replaced`);
		await Bun.write(path, "");
		await chmod(path, 0o600);
		expect(() => store.getRun("run-1")).toThrow("ownership");
	});

	test("database symlinks and shared file permissions fail closed", async () => {
		const path = store.path;
		store.close();
		await chmod(path, 0o644);
		await expect(RacStore.open(root, { dataRoot })).rejects.toThrow("private");
		await chmod(path, 0o600);
		await rename(path, `${path}.real`);
		await symlink(`${path}.real`, path);
		await expect(RacStore.open(root, { dataRoot })).rejects.toThrow();
	});

	test("log truncation preserves contiguous events, a single marker and control messages", async () => {
		store.close();
		store = await RacStore.open(root, { dataRoot, limits: { runLogBytes: 32 } });
		running();
		store.appendEvent("run-1", { kind: "text", text: "small" });
		expect(store.appendEvent("run-1", { kind: "text", text: "x".repeat(32) }).truncated).toBe(true);
		expect(store.appendEvent("run-1", { kind: "text", text: "ignored" }).event).toBeNull();
		store.appendEvent("run-1", { kind: "user_message", text: "stop please" });
		store.setRunStatus("run-1", "completed");
		const all = store.listEvents("run-1").events;
		expect(all.filter((event) => event.kind === "truncated")).toHaveLength(1);
		expect(all.map((event) => event.sequence)).toEqual(all.map((_, index) => index + 1));
		expect(all.some((event) => event.kind === "user_message")).toBe(true);
		const first = store.listEvents("run-1", 0, 2);
		expect(first.hasMore).toBe(true);
		const rest = store.listEvents("run-1", first.nextAfter);
		expect([...first.events, ...rest.events]).toEqual(all);
		expect(rest.hasMore).toBe(false);
	});

	test("retention removes entire terminal runs and sessions while retaining replay receipts", () => {
		store.idempotent("start", "BACK-796", "original", {}, () => {
			completed();
			return { runId: "run-1" };
		});
		clock += 31 * 24 * 60 * 60 * 1000;
		expect(store.pruneHistory()).toEqual(["run-1"]);
		expect(store.getSession("session-1")).toBeNull();
		expect(store.listTaskRuns("BACK-796")).toEqual([]);
		try {
			store.listEvents("run-1");
			throw new Error("Expected expired history");
		} catch (error) {
			expect(error).toMatchObject({ code: "history_expired", status: 410 });
		}
		expect(
			store.idempotent("start", "BACK-796", "original", {}, () => {
				throw new Error("must not replay action");
			}),
		).toEqual({ value: { runId: "run-1" }, replayed: true });
		const native = (store as unknown as { db: Database }).db;
		for (const table of ["events", "interactions", "runs", "sessions"])
			expect(native.query(`SELECT COUNT(*) AS count FROM ${table}`).get()).toEqual({ count: 0 });
	});

	test("active, unknown and terminal runs with unresolved interactions are protected from retention", async () => {
		running();
		store.createInteraction({
			id: "pending",
			runId: "run-1",
			kind: "question",
			blocking: true,
			rpcRequestId: 1,
			threadId: "thread-session-1",
			turnId: "turn-1",
			expiresAt: clock + 1000,
		});
		clock += 31 * 24 * 60 * 60 * 1000;
		expect(store.pruneHistory()).toEqual([]);
		store.setRunStatus("run-1", "failed", "provider_error");
		clock += 31 * 24 * 60 * 60 * 1000;
		expect(store.pruneHistory()).toEqual([]);
		store.settleInteraction("run-1", "pending", "cleared");
		expect(store.pruneHistory()).toEqual(["run-1"]);
		session("session-2");
		reserve("run-2", "session-2");
		store.close();
		store = await RacStore.open(root, { dataRoot, now: () => clock });
		clock += 31 * 24 * 60 * 60 * 1000;
		expect(store.pruneHistory()).toEqual([]);
		expect(store.getRun("run-2").status).toBe("unknown");
	});

	test("project capacity evicts the oldest eligible run without deleting part of a newer run", async () => {
		store.close();
		store = await RacStore.open(root, {
			dataRoot,
			now: () => clock,
			limits: { projectBytes: 1100, controlBytes: 256 },
		});
		session();
		reserve();
		store.setRunStatus("run-1", "running");
		store.appendEvent("run-1", { kind: "text", text: "x".repeat(650) });
		store.setRunStatus("run-1", "completed");
		clock++;
		session("session-2");
		reserve("run-2", "session-2");
		expect(store.listTaskRuns("BACK-796").map((run) => run.id)).toEqual(["run-2"]);
		expect(store.listEvents("run-2").events.map((event) => event.sequence)).toEqual([1]);
	});

	test("audit exhaustion fences execution and retains enough reserve for restart and human resolution", async () => {
		store.close();
		store = await RacStore.open(root, { dataRoot, limits: { controlBytes: 256 } });
		running();
		expect(() => store.appendEvent("run-1", { kind: "user_message", text: "x".repeat(200) })).toThrow(
			"reserve exhausted",
		);
		expect(() => store.createSession({ protocolVersion: "0.162.1" })).toThrow("ownership");
		store = await RacStore.open(root, { dataRoot, limits: { controlBytes: 256 } });
		expect(store.getRun("run-1").status).toBe("unknown");
		expect(store.resolveUnknown("run-1", true).status).toBe("abandoned");
	});

	test("asynchronous idempotency callbacks roll back database effects and fence the store", async () => {
		expect(() =>
			store.idempotent("start", "BACK-796", "async", {}, (async () => {
				session();
				return {};
			}) as unknown as () => JsonValue),
		).toThrow("synchronous");
		store = await RacStore.open(root, { dataRoot });
		expect(store.getSession("session-1")).toBeNull();
	});

	test("native read failure fences later operations and omits database diagnostics", () => {
		running();
		const native = (store as unknown as { db: Database }).db;
		native.run("DROP TABLE events");
		expect(() => store.listEvents("run-1")).toThrow("persistence failed");
		expect(() => store.createSession({ protocolVersion: "0.162.1" })).toThrow("ownership");
	});
});
