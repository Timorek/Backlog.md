---
id: BACK-795
title: '[RAC-06] Adapter i lifecycle procesu Codex app-server'
status: In Progress
assignee:
  - '@codex'
created_date: '2026-10-24T08:05:00Z'
updated_date: '2026-10-25T12:41:00Z'
labels:
  - rac
  - m1-local-mvp
  - backend
  - codex
  - mvp
  - macos
dependencies:
  - BACK-792
  - BACK-793
  - BACK-794
documentation:
  - docs/rac/decisions/0001-rac-architecture.md
  - docs/rac/CODEX-ADAPTER.md
  - docs/rac/spikes/rac-06-terminal.json
  - docs/rac/spikes/rac-06-terminal-policy-checks.json
  - docs/rac/spikes/rac-06-terminal-policy-matrix.json
  - docs/rac/spikes/rac-06-terminal-live-policy-fixed.json
  - docs/rac/spikes/rac-06-terminal-live-success.json
priority: high
ordinal: 405000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Zaimplementuj adapter ze wsparciem startThread, startTurn, steerOrContinue, interrupt, respondToRequest, subscribe. Na macOS uruchamiaj codex app-server jako child process w Bun (spawn z tablicą argumentów, bez shell:true). Zaimplementuj handshake, timeouty, obsługę stdout/stderr, restart, sprzątanie procesu oraz rozwiązywanie ścieżki do Codex CLI bez polegania na interaktywnym PATH. Kod adaptera powinien pozostać wieloplatformowy; nie publikuj app-server w internecie.

Ustalenia po review ADR-0001 (2026-10-24; zaakceptowane przez użytkownika):
Runtime to Bun/TypeScript w istniejącym Backlog.md. Używaj jawnego --listen stdio://, stałej binarki i argumentów bez shell. Allowlista outbound RPC zgodnie z ADR D5; nieobsługiwane server requests otrzymują natychmiastowy błąd i event. Nie wysyłaj command/exec, fs/*, thread/shellCommand ani zapisów config. Jawne polityki i weryfikacja efektywnych wartości jak w wynikach RAC-03. Zakończ całą własną grupę procesów, zweryfikuj EOF i przerwanie na wspieranym systemie.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Adapter uruchamia app-server i kończy proces po shutdown
- [x] #2 JSON-RPC requests i responses korelują po id
- [x] #3 Rozłączenie i crash procesu są wykrywane
- [x] #4 stdout zdarzeń nie jest traktowane jako polecenia shella
- [x] #5 Testy adaptera używają mock transport
- [ ] #6 Spawn i zamykanie procesu testowane na macOS; ścieżka binarki działa przy uruchomieniu z launchd
- [x] #7 Adapter pod Bun używa wyłącznie stdio i dozwolonych metod, bez otwartego listenera i bez metod ogólnego wykonania
- [x] #8 Nieobsługiwany request nie zawiesza tury; słabsza polityka blokuje start; cleanup procesów ma test na deklarowanym systemie
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 bun run check:types passes when TypeScript touched
- [x] #2 bun run check . passes when formatting/linting touched
- [x] #3 bun test (or scoped test) passes
<!-- DOD:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Confirm BACK-792/793/794 are Done; preserve the existing task order and keep work scoped to RAC-06.
2. Implement fixed absolute executable discovery and an explicitly configured Bun stdio subprocess environment, without a shell/listener. Keep project-scoped provider SQLite/logs in private external data directories.
3. Implement bounded JSONL RPC with typed ID correlation, request/write deadlines, method allowlist, scoped server requests, sanitized error diagnostics and disconnect fencing. No automatic mutation retries.
4. Implement initialize/initialized, verified start/resume thread policies, pinned cwd/runtime roots, explicit turn policy, start/steer/interrupt, constrained replies and restart. Omit environments after the real 0.162.1 matrix proved an empty list selects readOnly; keep all strict checks.
5. Implement EOF shutdown and bounded POSIX group escalation, including descendants surviving parent exit and blocked stdin. Verify actual synthetic process behavior on macOS. Resolve the binary independently of interactive PATH and verify the real provider under the transport environment; actual launchd service installation is RAC-20.
6. Verify mock protocol/adapter behavior, policy rejection, request-specific replies, race handling and safe diagnostics. The live smoke waits for matching turn/started and uses fresh per-message IDs without retries.
7. Record the normal-Terminal real-provider result: initialize and effective policy valid, model turn completed, interrupt acknowledged, response/notification turn IDs matched, interrupted completion, clean EOF and entire owned group stopped without forcing.
8. Preserve failure/matrix evidence separately, finalize current architecture/development docs, record passing tests/types/lint/build, verify all AC and mark Done. Commit this task locally only; do not push or begin RAC-07 automatically.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
RAC-06 implementation is available: src/rac/codex-process.ts (fixed executable resolution, Bun detached stdio transport, explicit environment, private project Codex state/log directories, EOF and bounded POSIX group escalation), codex-rpc.ts (bounded bidirectional JSONL, strict number/string IDs, method allowlist, request/write deadlines, disconnect fencing), codex-adapter.ts (handshake, verified restricted thread policy, turn/steer/interrupt, scoped replies and explicit restart).
Evidence by criterion: AC2 out-of-order and typed RPC IDs verified; AC3 crash/stdout/write disconnect verified with mock and real Bun process; AC4 stdout is parsed as JSON data and never executed; AC5 deterministic mock transport tests; AC7 only stdio and the reviewed outbound method allowlist, no listener/shell/general execution RPC; AC8 unsupported requests receive immediate errors, weak policy fences before turn start, and actual macOS process-group cleanup tests cover orphan/stubborn children and blocked stdin. These six criteria are checked.
AC1 and AC6 remain unchecked: real Codex 0.162.1 was spawned from the fixed absolute installation path with the adapter environment, but stopped before initialize with permissionDenied=true in this restricted session. Synthetic Bun process tests do not establish a successful real App Server handshake, effective policy or EOF shutdown. Current status remains In Progress pending normal-Terminal smoke verification. Script: scripts/rac/codex-adapter-smoke.ts, default no-model check plus --live --model gpt-6.1-sol for a synthetic completed and interrupted turn. No real project task is executed and approvals are declined. See docs/rac/CODEX-ADAPTER.md and sanitized local/schema artifacts.
Final checks: 190 tests / 603 assertions across 12 files PASS, including RAC-03 and RAC-05/server regressions; type check 574 files PASS; Biome 504 files PASS; normal CLI build and standalone Bun adapter bundle PASS; git diff --check PASS. Native Windows containment is fail-closed; Linux not validated. Process-group proof does not cover children that escape via setsid. Manager authorization, owner lock, interaction persistence, HTTP endpoints and UI remain later task responsibilities.
The task already had In Progress/@codex metadata and a changed ordinal at start. Preserve the existing ordinal change outside the scoped code commit. Groma is unavailable (command not found); no Groma-owned files touched. No push or next RAC task.

User ran the real adapter in normal macOS Terminal: initialize=true; threadPolicy=false; error=policy_mismatch; permissionDenied=false; authenticationFailed=false; shutdown exitedOnEof=true, forced=true, groupStopped=true. This now proves AC1 real App Server startup and shutdown, so AC1 is checked. It does not prove a compatible effective policy or successful model execution; task remains In Progress and AC6 is still open. Saved the exact sanitized outcome in docs/rac/spikes/rac-06-terminal.json. Improved policy_mismatch errors and the smoke JSON with named boolean policyChecks, without raw paths/configuration/tokens; every previous policy restriction is retained. Added a diagnostic/redaction regression test. Types 574 files, Biome 505 files and standalone adapter bundle pass; targeted adapter/RPC/native-process tests pass. Next user probe should omit --live: thread policy can be diagnosed without starting a model turn.

Second Terminal result: initialize=true, threadPolicy=false, policy_mismatch; cwd/approvalPolicy/reviewer/network/runtime-roots checks true, sandbox type/tmp exclusions/writable-roots checks false. Exact sandbox discriminant and shape are not yet captured; do not infer or weaken policy from these booleans. All process group members stopped (EOF parent exit, forced cleanup true). Investigate representation versus effective policy; keep task In Progress.

Added inspectCodexPolicy with unchanged strict checks and sanitized policyObserved. Unknown sandbox/profile/config strings are redacted to categories; no paths or raw config are printed. Added scripts/rac/codex-policy-diagnostic.ts: seven bounded thread-start-only variants (current, omit runtime roots, omit environment metadata, legacy persistent/ephemeral, nested/dotted restricted per-thread config). No turn/model/tool operation or approval response is sent. The production adapter has no automatic fallback or retry and its required policy is unchanged. Unit tests prove comparison differences, no execution RPC, cleanup, startup fail-fast and redaction. Verification: 44 targeted tests / 145 assertions across 4 files PASS; types 576 files PASS; Biome 508 files PASS; adapter plus diagnostic Bun bundle PASS; diff check PASS. Second user result saved unchanged in rac-06-terminal-policy-checks.json. Actual mismatch cause remains unconfirmed until the operator comparison runs outside this session; task stays In Progress, no further AC checked.

User supplied the complete real-host seven-variant comparison. With environments: [] the server returned readOnly in current/without-runtime-roots/nested-config/dotted-config cases. Without environments, both pinned-runtime-roots and legacy persistent/ephemeral variants returned workspaceWrite, networkAccess=false, both tmp exclusions=true, writableRootCount=0 (implicit cwd), all nine checks=true, and groupStopped=true. Saved the exact sanitized matrix in rac-06-terminal-policy-matrix.json. The differentiator on this Codex 0.162.1 host is the optional empty environments field. Removed it from production thread/start and turn/start, retaining pinned cwd/runtime roots, explicit turn sandbox, on-request/user approvals and every strict effective policy check. Updated adapter fixture and diagnostic fixture to reproduce the real behavior; injected options cannot reintroduce the field. Verification: 44 tests / 149 assertions across 4 files PASS; types 576 files PASS; Biome 509 files PASS; adapter bundle PASS; diff check PASS. No host config edits, broader profile, policy downgrade or automatic fallback. Task remains In Progress pending one final live smoke of the corrected production adapter (completed model turn, interrupt, shutdown); no new AC checked based on mocks alone.

The corrected production adapter now passed real initialize, strict thread policy and a completed model turn on the user host, then reported a generic rpc_error; EOF shutdown/group termination succeeded with forced=false. Saved that exact result in rac-06-terminal-live-policy-fixed.json. The failing method was not captured, so do not assume the cause or claim interruption passed. Added per-pending-request safe rpcFailure metadata (allowlisted method, integer code, classified reason; no provider text/data), smoke failedStage and response-versus-turn/started identity booleans. The probe now waits for matching turn/started before interruption, with a deadline and no retries, and generates fresh logical message UUIDs per invocation. Added end-to-end mock smoke tests for delayed startup, second-start failure and interrupt failure plus RPC metadata/redaction correlation. Fixture cleanup validates owned temporary paths. Verification: 48 tests / 171 assertions across 5 files PASS; types 577 files PASS; Biome 511 files PASS; adapter/smoke Bun bundles PASS; diff check PASS. Native interruption is still unverified; keep task In Progress and AC6 open. Next normal-Terminal live probe will either verify interruption or identify the exact failing stage/method/code/reason without raw sensitive output.

Final real-provider gate PASSED in user Terminal on macOS with the corrected production adapter and gpt-6.1-sol: initialize=true; threadPolicy=true; modelTurn=completed; interruptAcknowledged=true; startedNotificationSeen=true; responseMatchesStarted=true; interrupt=interrupted; permissionDenied=false; authenticationFailed=false; shutdown exitedOnEof=true, forced=false, groupStopped=true. Exact sanitized evidence: docs/rac/spikes/rac-06-terminal-live-success.json. This supersedes the open real-interruption gate without overwriting earlier failed attempts.
AC6 verification: real Bun spawning and EOF/group cleanup passed on macOS, including the production App Server. The binary was resolved from fixed absolute locations and executed in the transport-constructed environment; deterministic resolver tests cover explicit paths, executability and rejection of shell wrappers/relative PATH lookups. This establishes launchd-independent executable discovery/environment behavior. No actual launchd job/service was installed or tested; service deployment/auth context/autostart remains RAC-20. Windows native containment is not implemented and fails closed. Linux/native crash-resume remain unverified as documented.
All other AC already have mock and real-process evidence. Latest implementation verification remains 48 tests / 171 assertions in 5 files PASS; types 577 files PASS; Biome now 512 files PASS after the success artifact; adapter/smoke bundles PASS. Earlier broad RAC/server/spike regression was 190 tests in 12 files PASS. No implementation changed after these successful checks; the final native result verifies the same code. Documentation was rewritten around the final behavior and actual platform boundaries; historical failures remain linked as evidence. The exact cause of the earlier unclassified RPC failure is not claimed.
All 8 AC and 3 DoD items verified within this task scope. No execution endpoint, dashboard buttons, persistence/owner store or unrestricted process API added. No push, no next task. Preserve the pre-existing ordinal change outside the commit.

PR #1 review correction: AC6 includes execution from launchd, which was not actually tested. Fixed-PATH/environment tests do not prove that clause. Reopen and uncheck AC6; retain all verified adapter evidence and the pre-existing user ordinal edit. Actual launchd verification remains outstanding; no service installed by this correction.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Implemented the Bun Codex stdio adapter and process lifecycle with restricted policies/RPC methods, typed JSONL correlation, bounded waits, scoped replies and explicit restart. Real macOS gpt-6.1-sol verification completed a model turn, acknowledged and confirmed interruption, matched turn identities and exited on EOF with its owned group stopped without forcing. 48 targeted tests, type/lint checks and adapter/smoke bundles pass; prior broader 190-test regressions pass. Local binary discovery does not depend on interactive PATH; actual launchd service deployment is RAC-20. Windows containment and crash-resume remain separate gates. No execution UI/API or push.
<!-- SECTION:FINAL_SUMMARY:END -->
