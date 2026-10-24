import type { Database } from "bun:sqlite";

export const RAC_APPLICATION_ID = 0x52414331;
export const RAC_MIGRATIONS = [
	{
		version: 1,
		sql: `
CREATE TABLE project (
 id INTEGER PRIMARY KEY CHECK(id=1), projectKey TEXT NOT NULL UNIQUE,
 canonicalRoot TEXT NOT NULL, generation TEXT NOT NULL
);
CREATE TABLE sessions (
 id TEXT PRIMARY KEY, projectKey TEXT NOT NULL REFERENCES project(projectKey),
 provider TEXT NOT NULL CHECK(provider='codex'), threadId TEXT UNIQUE,
 currentTurnId TEXT, protocolVersion TEXT NOT NULL, createdAt INTEGER NOT NULL
);
CREATE TABLE runs (
 id TEXT PRIMARY KEY, projectKey TEXT NOT NULL REFERENCES project(projectKey),
 taskId TEXT NOT NULL, taskCreatedAt TEXT NOT NULL, taskRevision TEXT NOT NULL,
 sessionId TEXT NOT NULL REFERENCES sessions(id), ownerGeneration TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('starting','running','interrupting','interrupted','completed','failed','unknown','abandoned')),
 startedAt INTEGER NOT NULL, finishedAt INTEGER, errorCode TEXT, turnId TEXT,
 lastSequence INTEGER NOT NULL DEFAULT 0, payloadBytes INTEGER NOT NULL DEFAULT 0,
 logBytes INTEGER NOT NULL DEFAULT 0, controlBytes INTEGER NOT NULL DEFAULT 0,
 logTruncated INTEGER NOT NULL DEFAULT 0 CHECK(logTruncated IN (0,1))
);
CREATE UNIQUE INDEX one_active_run ON runs(projectKey) WHERE status IN ('starting','running','interrupting','unknown');
CREATE INDEX task_history ON runs(taskId, taskCreatedAt, startedAt DESC, id);
CREATE INDEX retention_runs ON runs(status, finishedAt);
CREATE TABLE interactions (
 id TEXT PRIMARY KEY, runId TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
 ownerGeneration TEXT NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('question','command_approval','file_approval','permission_approval','mcp_elicitation')),
 blocking INTEGER NOT NULL CHECK(blocking IN (0,1)),
 status TEXT NOT NULL CHECK(status IN ('open','answered','cleared','expired','uncertain','stale')),
 rpcIdJson TEXT NOT NULL CHECK(json_valid(rpcIdJson) AND json_type(rpcIdJson) IN ('text','integer')),
 threadId TEXT NOT NULL, turnId TEXT NOT NULL, itemId TEXT,
 openedAt INTEGER NOT NULL, expiresAt INTEGER NOT NULL, resolvedAt INTEGER
);
CREATE INDEX pending_interactions ON interactions(runId, status);
CREATE UNIQUE INDEX rpc_request_identity ON interactions(runId,ownerGeneration,rpcIdJson);
CREATE TABLE events (
 runId TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
 sequence INTEGER NOT NULL, timestamp INTEGER NOT NULL, kind TEXT NOT NULL,
 payloadVersion INTEGER NOT NULL CHECK(payloadVersion=1), payload TEXT NOT NULL CHECK(json_valid(payload)),
 PRIMARY KEY(runId, sequence)
);
CREATE TABLE idempotency (
 projectKey TEXT NOT NULL REFERENCES project(projectKey), operation TEXT NOT NULL,
 resourceId TEXT NOT NULL, keyHash TEXT NOT NULL, inputHash TEXT NOT NULL,
 result TEXT NOT NULL CHECK(json_valid(result)), createdAt INTEGER NOT NULL,
 PRIMARY KEY(projectKey, operation, resourceId, keyHash)
);
CREATE TABLE expired_runs (id TEXT PRIMARY KEY, expiredAt INTEGER NOT NULL);
PRAGMA application_id=${RAC_APPLICATION_ID};
`,
	},
] as const;

export function migrateRacDatabase(
	db: Database,
	migrations: readonly { version: number; sql: string }[] = RAC_MIGRATIONS,
): void {
	let version = (db.query("PRAGMA user_version").get() as { user_version: number }).user_version;
	for (const migration of migrations) {
		if (!Number.isSafeInteger(migration.version) || migration.version < 1)
			throw new Error("Invalid RAC migration version");
		if (migration.version <= version) continue;
		if (migration.version !== version + 1) throw new Error("RAC migrations must be contiguous");
		db.transaction(() => {
			db.run(migration.sql);
			db.run(`PRAGMA user_version=${migration.version}`);
		}).exclusive();
		version = migration.version;
	}
}
