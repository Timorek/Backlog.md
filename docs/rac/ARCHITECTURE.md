# Remote Agent Control — architecture map

Status: code map and link to RAC-02 ADR, 2026-10-24. Baseline: Backlog.md 1.55.3, commit `6f988de0`, fork `Timorek/Backlog.md`. No RAC runtime or buttons are implemented by this setup.

## Existing architecture and extension points

| Responsibility | Existing files | RAC integration |
| --- | --- | --- |
| Canonical CLI and browser startup | `src/cli.ts` | Future `rac` subcommands invoking the same manager as HTTP. Preserve task commands and allocation. |
| Shared task mutations | `src/core/backlog.ts` | Resolve tasks, enforce identity/read-only rules and apply semantic status/notes updates. Never parse or rewrite task Markdown in the Codex adapter. |
| Task detail, readiness and graph | `src/core/task-detail.ts`, `src/utils/readiness.ts` | Check dependency readiness before accepting a run; preserve graph semantics. |
| Storage, locks and serialization | `src/file-system/operations.ts`, `src/markdown/`, `src/utils/id-generators.ts` | Keep existing Markdown task storage authoritative; do not reuse task IDs for run identities. |
| Reactive corpus | `src/core/content-store.ts`, `src/utils/task-watcher.ts` | Continue publishing task updates through existing watchers. |
| HTTP server | `src/server/index.ts`, `BacklogServer.start` | Register `/api/rac/*` in the current Bun server. Apply authentication and authorization before any protected handler. |
| Frontend and API | `src/web/App.tsx`, `src/web/lib/api.ts` | Reuse routing, API error handling, theme, navigation and current WebSocket task refresh. |
| Task actions and details | `src/web/components/TaskCard.tsx`, `TaskDetailsModal.tsx`, `Board.tsx`, `TaskColumn.tsx` | Put optional Run action and compact run state into existing cards/details; add session contents inside task details. |
| Task relationships | `src/web/components/DependencyGraphSection.tsx`, `DependencyInput.tsx` | Reuse graph and dependency controls, not a second dependency model. |
| Verification | `src/test/`, `src/web/**/*.test.ts` | Extend Bun tests, DOM interaction tests and server endpoint tests; add a narrowly scoped browser flow when runtime starts are possible. |

Backlog runs on **Bun with TypeScript**, not a new Node service. React 19 and React Router power the existing UI; Bun serves the imported HTML entry and Tailwind plugin. Node is a development/build tool. The global Homebrew CLI is 1.55.2 and must not be used to test this 1.55.3 fork.

## RAC-02 decision record

The concrete design is recorded in [ADR-0001 — Architektura RAC i granice zaufania](decisions/0001-rac-architecture.md), **Accepted in stages** by the user on 2026-10-24: D1/D2/D4/D7/D8 direction is approved; D3/D5/D6/D9 are provisional pending RAC-03 evidence. This overview keeps the map of existing code; the ADR is the single design record for the decisions below, the accepted Q1–Q7 answers and the synchronized task requirements. The supplied package under `import/` remains historical input.

| Concern | Recommendation in ADR-0001 |
| --- | --- |
| Runtime | Optional `src/rac/` module inside the existing Bun backend; no separate application. RAC is off by default and enabled locally, outside the repository. |
| CLI and process ownership | One owner per canonical project root behind an exclusive lock with fencing; RAC CLI commands call the same authenticated local backend. No manager per CLI invocation. CLI ships with each matching API task, before the UI (Q1=A); enable/disable is local-only. |
| Task semantics | Core and Markdown remain authoritative; read-only, terminal-status and readiness rules are checked again before start. Run completion never automatically completes a task. The agent changes status/assignee through existing CLI. Execution follows user review of its plan; terminal status needs the user decision (MVP prompt convention and audit, Q2–Q4=A). |
| Sessions and recovery | Run, Session, Interaction and Event records; messages are events, waiting is derived from blocking interactions; `unknown` after uncertain process ownership, released only by an explicit human `resolve`; no automatic approval replay. |
| Persistence | Built-in Bun SQLite in a private OS data directory outside Git, with numbered transactional migrations using PRAGMA user_version and consistent backup. |
| Events | HTTP commands plus ordered, replayable SSE for RAC; the current task WebSocket stays in place and gains a payload-free `rac-updated` invalidation. |
| Codex | Private stdio adapter with explicit `--listen stdio://`; sandbox, approval policy and `approvalsReviewer: "user"` are set and verified on every thread; on-request is the default; version-specific behavior, field names and real questions/approvals are verified in RAC-03. |
| Security | Host/Origin/Content-Type checks on all existing routes before the first execution endpoint; decision credentials unreachable from the agent sandbox; identity-validated whole-dashboard protection before a tunnel. |
| Platforms | Develop and first verify on macOS; choose and validate the eventual host independently, including Windows-specific process/sandbox/ACL tests. |

## Existing UI integration

`TaskCard.tsx` can expose one optional Run action and a state indicator without changing drag behavior. `TaskDetailsModal.tsx` already edits description, plan, notes, acceptance criteria and relationships; a run section belongs there. Reuse current modal/focus controls and `DependencyGraphSection.tsx`. Render bounded, sanitized messages/logs and explicit question/approval scope. Keep the human task workflow complete when RAC is disabled. No RAC buttons, endpoint handlers or runtime modules are implemented by this documentation task.

## Upstream compatibility and updates

Preserve package identity, task schema, routes and current defaults; keep RAC optional, use additive modules and avoid new dependencies until justified. Runtime code uses portable process APIs and absolute paths supplied by configuration; no hard-coded Homebrew paths.

For an upstream update: start from a clean committed feature branch, `git fetch upstream --no-tags`, review incoming changes, merge `upstream/main`, resolve deliberately, then rerun types/lint/tests and dashboard checks. Do not reset or automatically rebase shared history. Case-insensitive macOS filesystems can collide on upstream tags `V0.3.3` / `v0.3.3`; no-tags fetching avoids importing those tags. Do not delete tags as setup cleanup.

## Review and delivery boundaries

RAC-01 is complete after user verification of the source dashboard on port 6421. RAC-02 records the reviewed ADR and user answers Q1–Q7. Later tasks must use the updated requirements and the ADR's task-impact table: no queue before RAC-23; one Idempotency-Key policy; whole-run retention and truncated events; no migration table or separate Message table. RAC-03 validates provisional Codex behavior; material deviations require a new review. Follow the ADR's task-by-task delivery and security gates; do not start another RAC task automatically.

## RAC-04 run-state contract

The first internal RAC code is documented in [RUN-STATE.md](RUN-STATE.md): immutable run records, lifecycle transitions, derived waiting, explicit unknown resolution, pure single-slot admission and a deterministic test mock. It does not add execution endpoints, storage or UI. Atomic reservation and authorization remain caller responsibilities in the later runtime tasks.

## RAC-06 adapter boundary

[CODEX-ADAPTER.md](CODEX-ADAPTER.md) documents the Bun stdio transport, restricted
RPC adapter, policy checks and tested macOS process-group shutdown. This is an
internal building block, with no execution endpoint or UI. The real-provider
smoke test remains a separate gate from mock protocol and synthetic process tests.

## RAC-07 persistence boundary

[PERSISTENCE.md](PERSISTENCE.md) documents the private Bun SQLite store, actual
EXCLUSIVE ownership, transactional migrations/idempotency and whole-run retention.
Session, run, interaction and event records survive restart; uncertain runs retain
the active slot. The future manager must hold the store for its lifetime, stop on
fencing and authenticate human resolution. This module adds no execution route,
discovery descriptor or dashboard feature.
