# Codex adapter (RAC-06)

RAC-06 adds an internal Bun adapter under `src/rac/`, inside the existing
Backlog.md backend. It does not add an execution endpoint, dashboard buttons,
ownership acquisition, persistence, or an alternative CLI runner. The manager
must check local RAC settings and acquire ownership before creating it. The
public execution commands remain scoped to later RAC tasks.

## Modules and contract

| Module | Responsibility |
| --- | --- |
| `codex-process.ts` | Resolve a fixed executable and own a Bun subprocess with stdin/stdout/stderr pipes and a POSIX process group. |
| `codex-rpc.ts` | Bound and parse JSONL; correlate RPC IDs, deadlines, server requests and notifications. |
| `codex-adapter.ts` | Handshake, verify thread policies, pin cwd, manage loaded threads and active turns, validate request-specific replies. |
| `testing/mock-codex-transport.ts` | Deterministic in-memory transport; no processes, network or model calls. |

These are internal source interfaces, not a supported external TypeScript SDK.

`CodexAdapter.connect(canonicalWorkspace, options)` initializes one connection.
`startThread` and `resumeThread` load a thread only after policy verification.
`startTurn` accepts text and a stable `clientUserMessageId`; duplicate active or
starting turns are rejected. `steerOrContinue` uses `expectedTurnId` when a turn
is active and starts another turn when it is finished. It does not queue a
message while the first turn ID is still pending. The manager still enforces
the project-wide single slot from RAC-04; the adapter is not that capacity store.

`interrupt` acknowledges the cancellation request. It does not report that the
turn has stopped. Consumers must observe `turn/completed` and its actual status;
RAC-10 owns run recovery and cancellation deadlines. A completed turn arriving
before the start response cannot erase a later, reentrant turn.

`subscribe` emits ordered protocol events. Disconnect clears loaded thread and
active-turn state. `restart` first closes the previous transport, then creates a
fresh connection and handshake. It never automatically resumes threads, retries
mutations, or recreates a run. Concurrent restart/shutdown is rejected. Closing
is idempotent. A timed-out outbound RPC fences and closes the connection because
the remote outcome may be unknown.

## Protocol and policies

The implementation follows [OpenAI App Server documentation](https://learn.chatgpt.com/docs/app-server)
and the experimental schema generated from installed Codex CLI **0.162.1**.
Schema fingerprints are in [rac-06-schema.json](spikes/rac-06-schema.json).
The local schema is authoritative for fields used here; documentation for newer
versions can differ. Version strings alone are not a compatibility guarantee.

Outgoing methods are restricted to `initialize`, `initialized`, `thread/start`,
`thread/resume`, `turn/start`, `turn/steer`, `turn/interrupt`, plus responses to
incoming server requests. There is no generic execution RPC, shell, HTTP
listener, daemon, WebSocket transport, config-write RPC, or PATH search for the
Codex executable. Stdout is parsed as data, never executed.

The adapter sends `approvalPolicy: on-request`, `approvalsReviewer: user`, pinned
cwd and `workspace-write` on thread start/resume. It verifies the response's cwd,
reviewer, approval policy, workspace sandbox type, disabled network access,
absence of extra writable roots and both temporary-directory exclusions. A
mismatch closes the connection before a turn can start. Every turn carries an
explicit restricted `sandboxPolicy` and the same cwd/reviewer/approval policy.
Runtime workspace roots are pinned, and extra roots in a thread response are
rejected. Thread/turn/steer requests omit the optional `environments` field.
The verified 0.162.1 host returned `readOnly` when given an empty list; omitting
it restored the requested `workspaceWrite` policy. All effective-policy checks
remain mandatory; omission does not mean that arbitrary host environment or
permission configurations are trusted without validation.
Codex 0.162.1's turn-start response does not echo these effective policies;
the adapter does not claim that it does. Steer has no policy overrides.

The process arguments disable configured MCP servers and set the temporary
write exclusions/network policy. Codex SQLite/log directories are private and
project-scoped under the external RAC data directory. Existing Codex account
authentication and provider session files remain in the normal user Codex home;
this is not a filesystem read-isolation guarantee. There are no repo-supplied
binary, data-root, arbitrary arguments, policies or environment overrides.

Protocol frames are capped at 1 MiB in either direction, with at most 64 pending
outgoing requests, 64 incoming requests and 64 outstanding writes. String IDs
are capped at 1024 characters and retain number/string identity. Every write has
a deadline, including approval responses; stdin backpressure cannot suspend it
indefinitely.
Malformed JSONL, truncated input, write failure, process exit or stdout EOF
invalidate the connection and reject pending calls. Stderr is drained into a
bounded private diagnostic tail; callers receive only permission/authentication
flags. It is not forwarded as raw dashboard output.

## Server requests

Unknown methods receive JSON-RPC error `-32601` immediately and produce an event.
Supported requests outside a loaded active thread/turn receive `-32602`.
Unanswered supported requests expire after 60 minutes by default, with an error
and no permission grant. Resolved/expired/replied requests cannot be answered
again; this is local fencing, not cross-process exactly-once delivery.

| Request | Permitted response subset |
| --- | --- |
| Command/file approval | One-time `accept`, `decline`, `cancel`, intersected with `availableDecisions` when present. No session grants, amendments, `grantRoot` or extra fields. |
| Permission approval | Empty `permissions` only; no new roots or network grants. |
| MCP elicitation | `decline` or `cancel` only. |
| Structured user question | String answer lists for the request's known question IDs. |

`respondToRequest` is a trusted manager operation. The caller must authorize the
human action and persist the Interaction before invoking it. It is not a login,
approval store, or browser endpoint. Native structured questions remain unproven
with the selected model from RAC-03; the manager must keep that feature gated
and use the reviewed fallback until verified. Events and content are untrusted
input for subsequent UI/logging work.

## Binary, environment and platform

An explicitly configured binary must be an absolute executable file. Otherwise
the fixed candidates are `/opt/homebrew/bin/codex`, `/usr/local/bin/codex`, and
`~/.local/bin/codex`. Symlinks resolve to the pinned executable. `.cmd`/`.bat`
wrappers are rejected, and a Windows binary must be `.exe`. No interactive
shell or user shell profile is invoked. A deliberately constructed PATH covers
standard tool locations; HOME, TMPDIR and locale are supplied without inheriting
arbitrary tokens or dynamic-loader variables. A launchd job must still run as
the user with the appropriate Codex account and filesystem access.

Native spawning and cleanup were tested on macOS with Bun. The transport starts
a detached POSIX group, closes stdin for EOF shutdown, then uses bounded
SIGTERM/SIGKILL escalation if any group member remains. It checks the group
even after the parent exits and does not await a blocked stdin flush before
starting the deadline. Failure to prove group termination rejects shutdown as
`cleanup_unverified`; callers must retain an unknown outcome.

This proves termination of the owned process group, not containment of arbitrary
descendants that create a new session or escape the group. Process groups alone
are not a security sandbox. Linux uses the POSIX implementation but has not
been validated here. Windows native spawning fails closed until a process-tree
containment/ACL implementation is verified; mock protocol code is portable.

## Verification and remaining gate

The tests cover mock protocol/adapter behavior plus actual synthetic Bun
subprocesses on macOS: EOF, crash, stubborn descendants, descendants remaining
after their parent exits, and blocked stdin. They also cover policy mismatch,
request-specific reply constraints, restart fencing and early completion races.

The real adapter was attempted in this restricted session with Codex 0.162.1.
It stopped **before initialize**, with `permissionDenied: true`; the sanitized
result is [rac-06-local.json](spikes/rac-06-local.json). This is not a successful
real-provider test and is not replaced by RAC-03's older ProbeRpc result.
RAC-06 remains **In Progress** until the real-provider gate is verified.

A subsequent [user Terminal attempt](spikes/rac-06-terminal.json) reached
initialize successfully but was stopped by `policy_mismatch` before a model
turn. The parent exited on EOF and the owned group was confirmed stopped after
escalation (`forced: true`). This proves real startup/shutdown, but does not prove
that the provider's effective policy matches RAC's restrictions. The smoke JSON
now includes `policyChecks`: a named boolean for each expected constraint, with
no raw configuration, paths or secrets. Any false check still blocks execution.
When diagnosing this failure, run the default probe first; `--live` is not
needed to inspect thread policy.

The [second Terminal result](spikes/rac-06-terminal-policy-checks.json) matched
cwd, approval policy, reviewer and network constraints but differed on sandbox
type, temporary exclusions and writable roots. This does not establish whether
the runtime returns another sandbox kind or a different representation. Error
reports now include `policyObserved`: only recognized sandbox kinds, built-in
profile categories, boolean flags and a writable-root count. Paths, custom
profile names and arbitrary configuration values are not printed.

To compare request variants without starting any model or tool:

```bash
../.rac-tools/bun-darwin-aarch64/bun scripts/rac/codex-policy-diagnostic.ts
```

This diagnostic uses a temporary workspace, a separate owned process for each
variant and the same strict requested sandbox/approval policy. It compares the
current request, omitted runtime-root/environment metadata, persistent versus
ephemeral threads and explicit restricted thread config overrides. The checks
remain identical for every result. It stops after startup or cleanup failure;
no variant launches a turn or receives an approval grant. These are operator
diagnostics only, not automatic fallback/retry behavior in the production adapter.

The [real comparison result](spikes/rac-06-terminal-policy-matrix.json) identified
the differentiator: requests with `environments: []` returned `readOnly`;
`without_environments`, `legacy_persistent` and `legacy_ephemeral` satisfied
every expected constraint, including temporary-directory exclusions. Nested and
dotted restricted config overrides did not change the empty-list outcome.
Production now uses the verified request shape without `environments`; the
comparison script preserves its original variant labels as a regression record.
Adapter and diagnostic fixtures reproduce this observed behavior. A final live
probe of the corrected production adapter is still required before completion.

The next real live attempt confirmed `initialize`, strict thread policy and a
completed model turn; a later RPC returned an error, while EOF shutdown and
process-group termination succeeded. The old report did not identify which
RPC failed, so it does not yet prove successful interruption. RPC errors now
include the correlated allowlisted method, numeric error code and a best-effort
reason category, without raw provider messages or error data. The smoke JSON
also reports the failed stage and whether the turn-start response matches the
observed `turn/started` identity.

The interruption probe waits for the matching provider `turn/started` event
before sending cancellation, with a bounded deadline and no retry. This tests
interruption of a confirmed active turn rather than assuming that an optimistic
start response is sufficient. Fresh per-message IDs prevent separate smoke runs
from reusing the same logical message identity. Production mutation retry and
run recovery behavior remain unchanged.

Run in a normal macOS Terminal from this checkout:

```bash
../.rac-tools/bun-darwin-aarch64/bun scripts/rac/codex-adapter-smoke.ts
../.rac-tools/bun-darwin-aarch64/bun scripts/rac/codex-adapter-smoke.ts --live --model gpt-6.1-sol
```

The default probe creates an empty temporary workspace and tests handshake,
thread policy and shutdown without a model turn. `--live` additionally requests
one synthetic text-only model turn and interrupts another. It does not work on
this repository, accepts no approvals, and never prints authentication material
or raw provider logs. It uses the configured model when `--model` is omitted.
Success requires `initialize: true`, `threadPolicy: true` and
`shutdown.groupStopped: true`; live mode also requires `modelTurn: completed`
and `interrupt: interrupted`. Inspect `exitedOnEof` and `forced` separately.
Provider logs/state and raw rollout history stay outside Git. The smoke result
contains only the bounded verification summary.
