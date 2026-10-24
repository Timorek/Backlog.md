# RAC persistence (RAC-07)

`src/rac/store.ts` is the internal Bun SQLite store for the future Agent Manager.
It reuses project identity, private data paths and lifecycle rules from RAC-04/05.
It does not start Codex, change task Markdown, register execution endpoints, enable
RAC or add dashboard controls. The existing application remains usable without it.

## Location and ownership

`RacStore.open(canonicalRoot)` resolves the existing project's real path and SHA-256
project key. The database is `rac.sqlite` alongside external `settings.json`:

| Host | Default project directory |
| --- | --- |
| macOS | `~/Library/Application Support/Backlog.md/rac/<projectKey>/` |
| Linux | `$XDG_STATE_HOME/backlog-md/rac/<projectKey>/`, defaulting to `~/.local/state/backlog-md/rac/<projectKey>/` |
| Windows | Storage fails closed until private ACL handling is verified. |

POSIX directories must belong to the current user and exclude group/other access;
new directories use 0700. The database and existing journal sidecars must be regular,
private files without symlinks or hardlinks; new database and backup files use 0600.
The existing data-root validation excludes the checkout and its ancestors. A moved
checkout gets a new project key and history; there is no relinking registry.

Opening acquires `locking_mode=EXCLUSIVE`, then a real `BEGIN EXCLUSIVE` write
transaction before returning ownership. WAL mode and `synchronous=FULL` use the
same retained connection. A second owner gets `store_owned` rather than launching
another agent or guessing from a PID/timeout. Keep a strong reference to the store
for the backend lifetime; release it with `close()` during shutdown.

The owner generation is renewed under the lock. Every operation checks the current
generation/project/root, database inode and private-file properties. Identity loss
or unexpected database errors fence the instance and close its connection after
rollback. Admission and writes use transactions; no new starts are permitted on a
fenced instance. Runtime must stop its agent when persistence/ownership fails.
This does not protect against a malicious process running as the same OS user.

RAC-08 must retain the store, authorize the workspace and acquire ownership before
publishing any private authenticated discovery descriptor or starting a process.
On `store_owned`, newer schema or storage failure, disable RAC for that backend
while keeping ordinary Backlog routes available. This task adds no descriptor or
HTTP integration. Later authenticated commands must not accept an owner identity
from untrusted request fields.

## Records and recovery

| Record | Meaning |
| --- | --- |
| Project | One canonical root, project key and current owner generation. |
| Session | Codex provider/protocol version, unique optional thread ID, current turn. |
| Run | One task and session; raw-byte SHA-256 task revision, task creation identity, generation, lifecycle state, turn, timestamps and safe error code. |
| Interaction | Pending request identity including JSON-RPC number/string type, run/generation/thread/turn/item, kind, deadline and resolution. |
| Event | Per-run sequence, timestamp, kind, payload version and sanitized JSON; user/agent messages are events. |
| Idempotency | Shared receipts for start/cancel/resume/resolve/message/answer/decide, keyed by operation/resource and hashed key; hashed canonical request plus sanitized result. |
| Expired run | An ID and expiry time only, to distinguish removed history (410) from missing history (404). |

Task IDs use the existing canonicalizer. History reads can filter by task creation
time to distinguish a reused ID; revision hashing preserves exact bytes, including
line endings. This store never rewrites tasks or marks them Done. The single active
slot is enforced by the lifecycle helper and a partial unique database index.

On a new owner, nonterminal runs become `unknown`, open interactions become
`uncertain`, and old generation identity is retained on their records. No provider
process is launched, resumed, queried or answered automatically. Repeated restarts
do not append duplicate unknown events. Unknown holds the active slot until explicit
human resolution to `abandoned`; old open/uncertain requests then become stale.
The boolean proof input to `resolveUnknown` is an internal precondition, not user
authentication: the later manager/API must establish a human decision and evidence
that the previous process stopped before calling it.

Interaction responses likewise need later policy/credential checks and an active
transport. Storing an answered status alone does not send a provider response.
One session can retain sequential runs; thread rebinding and overlapping turns are
rejected. Old owner generations cannot append messages or settle interactions.

## Transactions and migrations

`store-schema.ts` contains numbered immutable migrations. Each migration's SQL and
`PRAGMA user_version` update run in the same exclusive transaction. Application ID
and stored project identity are checked; a newer schema or foreign database is
rejected without overwriting its version/data. Never edit an applied migration;
append a contiguous version. There is no migration registry table or ORM.

Before an upgrade, `VACUUM INTO` creates a consistent snapshot including committed
WAL content under the private directory. After fsync it replaces the single
`rac.sqlite.backup`; no unbounded backup series or copy of only the main WAL file.
Migration failure closes RAC and leaves the transactional schema unchanged. Recovery
of a damaged database from backup is a deliberate maintenance action, not automatic
replay. Version 1's initial backup is the empty version-0 database.

`idempotent()` wraps synchronous database mutations, event writes and a result
receipt in one transaction, including nested store calls. Same key/input replays
the stored result; changed input returns 409. Validation errors roll back without a
receipt. The callback must not perform external effects, spawn processes, send RPC
or return a Promise. Async callbacks fence the store. The manager must use the
committed reservation to dispatch an external effect, and recover uncertainty as
unknown; these receipts do not promise exactly-once external execution.

## Bounded history and secret handling

Defaults are 30 days, 100 MiB of serialized event payloads per project, 4 MiB of
text logs per run and 256 KiB reserved per run for control/message/state events.
Each JSON event/result is at most 64 KiB; reads return at most 500 records per page.
Event pagination uses the last sequence; history uses bounded limit/offset.

Only complete eligible terminal runs are removed, oldest first, with their events,
interactions and otherwise unused session. Active/unknown runs and runs with open
or uncertain interactions stay protected even after interaction deadlines. A new
run reserves audit capacity before admission; protected history can block admission.
At the log limit, exactly one `truncated` event is appended, subsequent log text is
dropped and sequence numbers remain contiguous. Control messages still work. A
small state reserve survives control exhaustion for restart/unknown resolution;
audit exhaustion fails closed and requires the runtime to stop execution.

The project limit counts logical event payloads, not physical SQLite/WAL/backup
size or metadata. Idempotency receipts and expired-ID tombstones survive run
retention so a retry cannot recreate an expired run. Their growth and filesystem
free-space monitoring need operational policy later; no background job or automatic
vacuum is introduced. Pending/unknown records are never deleted to reclaim space.

Persist only allowlisted text/message/error events and explicit typed metadata.
Errors are enum codes; raw provider errors, auth/config objects and arbitrary RPC
payloads are rejected. Text redacts configured exact credential values, common
OpenAI/GitHub/AWS/JWT tokens, authorization headers, private keys, credential
assignments and URL credentials. Receipt keys/requests are hashes, not raw values.
Credential-named JSON result fields are rejected.

Pattern redaction cannot detect arbitrary unknown secrets or a token split across
separate events. RAC-09 must sanitize assembled logical items before persistence
and provide known sensitive values; raw transport chunks are not safe log events.
Runtime credential isolation remains a separate gate. Never store secrets first
and rely on redacting them only when serving history.

## Verification and platform evidence

```bash
bun test --timeout=10000 src/test/rac-store.test.ts src/test/rac-store-process.test.ts
bun run check:types
bun run check
```

Tests use private temporary projects and real Bun SQLite. They cover migration
rollback/version preservation, newer-schema rejection alongside an ordinary
Backlog config operation, private paths, replay/rollback, redaction, event paging,
truncation, audit exhaustion, protected whole-run retention, generation/inode
fencing, second-process exclusion and SIGKILL recovery of committed WAL events.

Verified on macOS arm64 with Bun 1.4.4 (embedded SQLite 3.51.0). No native Windows
storage support or Linux execution verification is claimed. SQLite's documented
WAL-reset race involves concurrent connections writing/checkpointing; this store's
single EXCLUSIVE connection prevents that topology. Revalidate locking and bundled
SQLite when changing Bun or allowing multiple connections.

Sources: [Bun SQLite](https://bun.com/docs/runtime/sqlite),
[SQLite exclusive locking](https://www.sqlite.org/pragma.html#pragma_locking_mode),
[WAL without shared memory](https://www.sqlite.org/wal.html#use_of_wal_without_shared_memory),
[consistent VACUUM INTO snapshot](https://www.sqlite.org/lang_vacuum.html).
