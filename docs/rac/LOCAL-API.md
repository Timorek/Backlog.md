# Local RAC API and planning runs (RAC-08)

RAC-08 connects the existing Bun backend, Core, SQLite store and Codex adapter.
It adds local pairing and planning runs through the canonical CLI and the same
HTTP API. It does not add Run buttons, implementation continuation, answer/decide,
SSE, cancel/resume or public access. An explicit human resolve command is available for uncertain history. Those belong to the later roadmap tasks.

## Start and pair

From this source checkout with the tool PATH in [DEVELOPMENT.md](DEVELOPMENT.md):

```bash
bun src/cli.ts browser --no-open --port 6421
```

RAC must have been explicitly enabled locally. If disabled, normal Kanban still
works; the server does not enable it. If another backend owns the project or the
store cannot be opened, this instance serves ordinary Backlog without RAC. A
validated existing descriptor supplies the owner address when available.

In a second terminal in the same project:

```bash
bun src/cli.ts rac pair
```

Open the returned `pairUrl` (normally `http://127.0.0.1:6421/rac/pair`) and enter the
code. This one-use code expires after two minutes and at most five attempts;
issuing a new code invalidates the previous one. Do not save the code in logs.
Successful pairing sets an HttpOnly, SameSite=Strict, project-specific cookie.
Sessions last up to eight hours, are bounded to 32, and are invalidated by owner
restart. Pair again after restarting; this does not ask for the macOS account
password. Pairing was explicitly approved by the user on 2026-10-25.

The CLI authenticates with a random secret in private `owner.json` outside Git,
alongside the database. Publication follows actual SQLite ownership. Descriptor
URL, project and owner generation are validated; credentials travel in headers,
never query strings or subprocess arguments. The server removes its descriptor
on orderly shutdown and checks fresh RAC settings before commands. Authorization
does not trust a project/cwd supplied by a request.

## Canonical planning commands

```bash
bun src/cli.ts rac start BACK-123 --idempotency-key planning-1
bun src/cli.ts rac status <runId>
```

Start reads the current raw task SHA-256 unless `--expected-task-revision <sha>` is
provided. It prints its key and revision for explicit retries. Reuse both after a
network failure; do not silently choose a different key. A repeated committed
request replays its original reservation even if the agent has since edited the
task. A changed request with the same key returns 409. No automatic network retry
or second manager is created by CLI invocations. Output includes `schemaVersion: 1`,
the project key and owner generation. API clients must preserve these bindings.

The manager rereads a unique local task through Core/FileSystem, verifies its
path, raw revision, creation identity, readiness and absence of an ongoing Git
merge/rebase/cherry-pick/revert. Missing, archived, ambiguous, cross-branch-only,
finished or blocked tasks cannot start. It checks again before spawning the
provider. SQLite atomically reserves a session/run and receipt. A busy or unknown
run gives `409 run_active`; no queue is created. Provider startup follows the
committed reservation, so 202 means accepted, not that model execution succeeded.
Read status for startup failure or completion.

The manager sends task Markdown as text RPC input, never as a shell command or
CLI argument. The executable, arguments, cwd and sandbox policy come from the
existing backend/adapter. The request body cannot override them. The manager does
not edit task status or assignee; the agent uses the existing Backlog CLI.

The initial turn asks for a researched plan saved through Backlog CLI, followed
by human review and an end to the turn. There is no implementation/continuation
endpoint. Questions requiring an answer stop the planning run; approvals are
declined without granting permissions. Final sanitized agent messages and state
are stored; command-log streaming is deferred to RAC-09. The planning timeout is
five minutes. Shutdown/fencing closes the adapter before releasing SQLite;
unverified cleanup becomes unknown. A disconnect, startup timeout or disable with verified owned-group cleanup becomes interrupted, without pretending the task completed.

This is a workflow gate with one planning turn, developer instructions and absent
continuation commands. The verified workspace-write sandbox still allows project
writes, including task-plan/status changes. It is not a filesystem guarantee that
a model can only edit the plan. Task/repository text remains untrusted, and prompt
instructions are not a security boundary. The separate human interaction protocol
and its isolation checks remain required before implementation continuation.
Run completion does not complete the task.

After a crash or unverified cleanup, inspect the previous process and confirm it
has stopped before explicitly resolving the run:

```bash
bun src/cli.ts rac resolve <runId> --confirm-process-stopped --idempotency-key resolution-1
```

This requires the enabled authenticated owner and a stable key. It never kills
or identifies a process from an untrusted PID and never resumes execution. The
flag is a human assertion, not automatic proof. A live owned process or pending
startup/cleanup blocks resolution. An unknown run becomes abandoned; a terminal
run can retire stale pending interactions while keeping its original outcome.
Cancel/resume and interaction answers/decisions remain later delivery gates.

## Current HTTP surface

| Method/path | Contract |
| --- | --- |
| `GET /rac/pair` | Local pairing form in the existing backend. |
| `POST /api/rac/pair` | CLI credential only, `{}`; issue a one-use code. |
| `POST /api/rac/session` | `{ code }`; exchange code for project cookie and CSRF value. |
| `GET /api/rac/session` | Authenticated browser CSRF bootstrap, no mutation. |
| `POST /api/rac/runs` | Only `{ taskId, expectedTaskRevision }` and `Idempotency-Key`; 202 reservation. |
| `POST /api/rac/runs/:id/resolve` | Only `{ previousProcessStopped: true }` and `Idempotency-Key`; authenticated human resolution. |
| `GET /api/rac/runs/:id` | Run snapshot, planning phase, `implementationAvailable: false`. |
| `GET /api/rac/tasks/:id/runs` | Bounded history and current revision (null for a removed/archived task). |

Every RAC API access first checks the enabled owner/project. Cookie mutations
require `X-RAC-CSRF`; CLI requests require Bearer plus project/owner headers.
Other operation paths return 404. JSON input is streamed with a 16 KiB cap (256
bytes for pairing), and RAC requests share a 120/minute owner limit. Structured
errors use `{ error, code }`; no provider error body or stack trace is returned.
All generated credentials are registered for redaction before log persistence.
The in-memory known-secret registry is bounded to 512 values. Pair-code protection expires after two minutes and session-value protection after eight hours; owner/configured credentials remain protected for their full lifetime. Expired values are pruned without restarting the owner.

## Shared request and frontend boundaries

All native API handlers, HTML, bundled/project assets and fallback requests check
the exact loopback Host and listening port. Foreign Origin and cross-site fetch
metadata are rejected, except safe top-level document navigation from another site. Browser mutations and all RAC mutations require the matching Origin; WebSocket upgrades and event-stream requests require it too. Existing non-browser local API clients without browser metadata/cookies can omit Origin. RAC mutations always require JSON. Ordinary requests with a body require JSON except the existing decision editor PUT, which preserves plain text/Markdown (including legacy requests without Content-Type); bodyless ordinary actions do not need a synthetic JSON header.
Rejection happens before dispatch, parsing or task mutation. Authorized WebSocket upgrades dispatch before native HTML rendering, so the root task-update socket receives101 rather than the SPA response. No CORS grant or
reverse-proxy trust is introduced. Existing ordinary task routes remain usable
without RAC pairing; whole-dashboard identity protection for remote access is
still RAC-18/19. Do not publish the listener or put a tunnel in front of it yet.

Bun native HTMLBundle routes and auto-served development assets bypass fallback
fetch. `dashboard-bundle.ts` therefore serves the same frontend from guarded
handlers, using an in-memory source build or the existing packaged manifest.
Asset URLs are rooted so nested task/board routes work. Both source and compiled
bundle rendering were checked. Native development HMR is disabled on this
listener to avoid an unguarded path. Backend watch/restart remains available;
restart after frontend edits as well. Markdown task updates still use the
existing watchers and dashboard WebSocket. No second frontend or Kanban exists. HTML/API reads remain no-store; hashed bundle assets use immutable caching and project assets preserve their existing cache behavior. Ordinary unhandled handler exceptions still use the original logged HTTP 500 path. Unknown route value shapes are rejected at registration, before listening.

Private owner credentials can be read by a process running as the same OS user.
The Codex sandbox's known outside-read behavior is not credential isolation.
There is deliberately no answer/decide capability here; later work must keep human
decision credentials unreachable by the agent and separately verify isolation.
Local Host/Origin controls are not remote-user authentication or protection from
a compromised OS account. Windows remains gated on ACL/process containment work.

## Verification

```bash
bun test --timeout=10000 src/test/rac-*.test.ts src/test/server-rac-workspace.test.ts scripts/rac/*.test.ts
bun scripts/rac/rac-api-smoke.ts
bun scripts/rac/rac-api-smoke.ts --live
```

The default smoke uses a fixture Codex transport with real HTTP. Live mode uses
the existing Codex account/default model in a temporary repository, supplies the
source CLI path in its instructions, refuses approvals and deletes the fixture.
It never targets the project's actual tasks or enables its settings. Live mode
adds proof that Codex saved a plan without creating the implementation document
or marking the task Done. It does not prove arbitrary prompt injection impossible.

The restricted agent session cannot bind a listener (`listener_unavailable`);
unit/integration tests exercise the actual configured native route callbacks and
CLI/API dispatch with network interception instead. The user ran live smoke from
normal macOS Terminal on 2026-10-25. All checks succeeded, including the real HTTP
guards/pairing/CSRF, one idempotent run, 409 on busy, completed model turn, saved
plan, no implementation document and task not Done. Exact supplied output is in
[the terminal artifact](spikes/rac-08-terminal-live-success.json).

Protocol reference: [official Codex App Server documentation](https://learn.chatgpt.com/docs/app-server).
Routing references: [Bun routing](https://bun.com/docs/runtime/http/routing) and
[HTML bundle serving](https://bun.com/docs/bundler/fullstack). The installed
Codex 0.162.1 schema/RAC-06 policy checks remain the executable compatibility gate.
