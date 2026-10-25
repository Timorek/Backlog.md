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

## Verification

The [successful real adapter probe](spikes/rac-06-terminal-live-success.json)
was supplied from the user's normal macOS Terminal using `gpt-6.1-sol`. It
confirmed initialization, all strict thread policy checks, a completed model
turn, matching response/started turn identities, acknowledged interruption and
an `interrupted` completion. Shutdown exited on EOF without escalation and
confirmed the owned process group stopped. RAC-06's real-provider gate is closed.

The last implementation checks passed 48 tests / 171 assertions across five
files, type checking of 577 files, Biome checks of 511 files and Bun bundles of
the adapter and smoke script. The earlier broader regression run passed 190
tests across 12 files, including RAC-03 and RAC-05/server regressions.

Tests include mock protocol/adapter behavior and actual synthetic Bun processes
on macOS: EOF, crash, stubborn descendants, descendants remaining after their
parent exits and blocked stdin. They also cover policy mismatch, constrained
replies, restart fencing, early completion, correlated/redacted RPC failures
and delayed turn-start notifications in the live probe.

The real provider was resolved from fixed absolute installation locations and
spawned with the transport's deliberately constructed environment, rather than
an interactive shell PATH. This verifies the executable discovery/environment
part of the launchd requirement. No actual launchd job was installed or tested;
service installation, autostart and service-account behavior remain RAC-20.
Windows containment and persistent resume after a crash remain separate gates.

### Compatibility findings

The [real request matrix](spikes/rac-06-terminal-policy-matrix.json) showed that
`environments: []` produced `readOnly` on the verified 0.162.1 host. Omitting that
optional field restored `workspaceWrite` with all required checks true. The
production adapter omits the field on thread/turn requests; it never relaxes
policy validation or automatically retries with another profile. The diagnostic
script retains its original variant labels as a regression record.

A later [partial live attempt](spikes/rac-06-terminal-live-policy-fixed.json)
completed a model turn but returned an unclassified RPC error afterwards. That
report did not identify the failing method, so its precise cause is not proven.
The successful final probe waits for matching `turn/started` before sending
interruption and uses fresh per-message IDs for independent probe runs. It uses
bounded waits and no mutation retries. RPC failure reports now include method,
numeric code and a best-effort reason category; raw provider text/data are not
printed. `failedStage` and turn-identity agreement distinguish startup and
interruption failures.

Earlier failures remain recorded independently: [restricted-session startup](spikes/rac-06-local.json),
[first Terminal policy failure](spikes/rac-06-terminal.json), and
[per-field policy checks](spikes/rac-06-terminal-policy-checks.json). They are
historical diagnostics, not successful verification results.

### Reproduce

From this checkout in a normal macOS Terminal:

```bash
../.rac-tools/bun-darwin-aarch64/bun scripts/rac/codex-adapter-smoke.ts
../.rac-tools/bun-darwin-aarch64/bun scripts/rac/codex-adapter-smoke.ts --live --model gpt-6.1-sol
```

The default checks handshake, thread policy and shutdown without a model turn.
Live mode additionally completes one synthetic text-only turn and interrupts
another. It uses an empty temporary workspace, never project tasks, and grants
no approvals. It uses the configured model if `--model` is omitted. Success
requires `initialize: true`, `threadPolicy: true`, `shutdown.groupStopped: true`,
and in live mode `modelTurn: completed` plus `interrupt: interrupted`. Inspect
`exitedOnEof` and `forced` separately. Provider artifacts stay outside Git;
only the sanitized result is committed.

For thread-policy diagnosis without any model or tool turn:

```bash
../.rac-tools/bun-darwin-aarch64/bun scripts/rac/codex-policy-diagnostic.ts
```

Each variant owns a separate process and uses identical strict policy checks.
The diagnostic stops after startup or cleanup failure and never grants an
approval. `policyObserved` contains only recognized sandbox/profile categories,
boolean flags and a writable-root count; no paths or custom profile names.
These are operator diagnostics, not production fallback behavior.
