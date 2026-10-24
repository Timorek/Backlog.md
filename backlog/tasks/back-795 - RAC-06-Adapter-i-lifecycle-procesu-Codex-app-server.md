---
id: BACK-795
title: '[RAC-06] Adapter i lifecycle procesu Codex app-server'
status: In Progress
assignee:
  - '@codex'
created_date: '2026-10-24T08:05:00Z'
updated_date: '2026-10-24T18:59:00Z'
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
1. Verify BACK-792/793/794 are Done; preserve the pre-existing task status/ordinal edits and work only on RAC-06. Use official OpenAI Docs plus local Codex 0.162.1 experimental schema; Groma unavailable.
2. Implement a minimal Bun stdio process transport and JSONL RPC connection under src/rac/: fixed executable/argument list, bounded frames/stderr/pending requests, strict request ID type correlation, handshake/deadlines, unknown request errors, disconnect propagation. No shell, listener or general execution RPC.
3. Implement a Codex adapter with startThread/resumeThread, startTurn, steerOrContinue, interrupt, respondToRequest and subscribe. Pin the constructor workspace, use explicit on-request/user/workspace-write policy, verify effective thread policy and require the pinned thread before turns. Do not retry uncertain mutating RPC or automatically recover runs.
4. Resolve the Codex binary from an explicit trusted absolute path or fixed installation locations, independent of interactive PATH. Use a deliberate child environment. Restart closes and fences the old transport, clears loaded thread/request state and performs a fresh handshake; no auto-resume.
5. Implement EOF shutdown and bounded TERM/KILL escalation for the owned POSIX process group, including descendants remaining after the parent exits. Unsupported native process-tree containment fails closed on Windows rather than claiming validation. Test actual Bun spawning/EOF/crash/group cleanup with synthetic subprocesses on macOS.
6. Test adapter/protocol with an in-memory transport: chunked/malformed/oversized JSONL, IDs, timeouts, allowed methods, policy mismatch, requests/responses, EOF/crash/restart and event ordering. Reject broad session grants and unsupported server requests immediately. Keep persistence and human authorizations outside this adapter.
7. Attempt a no-model real App Server initialize/thread-policy probe; record environment failures honestly. Add a copyable Terminal smoke command if native Codex remains blocked. Do not mark real-provider or cleanup AC proven by mocks alone.
8. Run targeted tests, existing RAC regressions, types, Biome and build. Document protocol/schema/OS and cleanup limits in docs/rac; update only proven AC, prepare scoped local commit, no push or next RAC task.

Real Terminal smoke reached initialize but failed strict thread policy verification (policy_mismatch), with no model turn and successful process-group cleanup. Add sanitized per-field policy check diagnostics to the adapter error and smoke JSON so the actual mismatch can be identified; retain every restriction. Record this failed real-provider attempt separately and keep AC1/6 open until the mismatch is understood and a real probe succeeds.

Diagnose the remaining real-host sandbox mismatch without changing production policy: share one strict policy inspector between adapter and diagnostics; expose only recognized sandbox kinds/profile categories and primitive limits; add an operator-only comparison of current versus omitted metadata, persistent/ephemeral threads and restricted thread config overrides. Each variant uses a separate owned process, has no turn/model/tool call, retains identical policy checks, and stops after startup/cleanup failure. Use the normal-Terminal comparison result to choose a demonstrated compatible request shape before editing production policy construction.

User Terminal matrix identifies environments: [] as the differentiator: current/without-runtime-roots/config-overrides return readOnly; without-environments and legacy persistent/ephemeral return workspaceWrite with every required check true. Remove the optional environments field from thread/start and turn/start; retain pinned roots, explicit turn policy and every strict response check. Update fixtures to reproduce the observed distinction, save exact matrix evidence, test and commit. Require a final real --live run before completing RAC-06.
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
<!-- SECTION:NOTES:END -->
