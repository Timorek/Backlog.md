---
id: BACK-796
title: '[RAC-07] Persistence Run oraz Session mapping'
status: Done
assignee:
  - '@codex'
created_date: '2026-10-24T08:05:00Z'
updated_date: '2026-10-24T20:21:00Z'
labels:
  - rac
  - m1-local-mvp
  - persistence
  - backend
  - mvp
dependencies:
  - BACK-793
  - BACK-794
documentation:
  - docs/rac/decisions/0001-rac-architecture.md
  - docs/rac/PERSISTENCE.md
priority: high
ordinal: 406000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Zaimplementuj lokalny magazyn metadanych uruchomień i zdarzeń w Bun SQLite poza repo. Dane: runId, taskId, projectKey, threadId, turnId, status, timestamps, sanitized errors, pending request IDs. Backlog taski zostają w Markdown. Dodaj migracje i indeksy.

Ustalenia po review ADR-0001 (2026-10-24; zaakceptowane przez użytkownika):
Q7: jedna tabela idempotencji dla wszystkich mutacji; wiadomości jako eventy bez osobnej encji Message; migracje przez PRAGMA user_version w transakcji; retencja całymi runami terminalnymi, event truncated przy limicie logów runa. Katalog danych i lock poza Git. projectKey z realpath, przeniesienie repo tworzy nową historię. Run zapisuje taskCreatedAt i SHA-256 surowej treści taska jako taskRevision. Ownership z fencingiem: rekomendacja SQLite EXCLUSIVE wymaga faktycznego uzyskania blokady transakcją przed deskryptorem, nie samej PRAGMA; drugi serwer bez RAC. unknown i otwarte interakcje chronione przed retencją.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Uruchomienie mapuje się do jednego taska i jednej sesji Codex
- [x] #2 Historia uruchomień przetrwa restart backendu
- [x] #3 Migracje są powtarzalne i testowane
- [x] #4 Nie zapisuje się tokenów ani sekretów w logach
- [x] #5 Odczyt historii działa po taskId
- [x] #6 Migracje są atomowe z user_version; nieznana nowsza wersja blokuje RAC bez uszkodzenia zwykłego Backloga
- [x] #7 Jeden właściciel projektu utrzymuje wyłączną blokadę; utrata ownership odgradza starty i zapisy
- [x] #8 Historia, idempotencja i retencja odpowiadają Q7 bez osobnej tabeli wiadomości lub kasowania środkowych eventów
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 bun run check:types passes when TypeScript touched
- [x] #2 bun run check . passes when formatting/linting touched
- [x] #3 bun test (or scoped test) passes
<!-- DOD:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Confirm readiness and assign BACK-796 In Progress. Preserve the existing unrelated BACK-795 ordinal edit; Groma unavailable. Use the reviewed SQLite/Q7 design and existing RAC identity/lifecycle helpers.
2. Verify Bun SQLite EXCLUSIVE+WAL behavior with real connections and subprocesses. Acquire an actual exclusive write transaction before exposing ownership; retain the same connection. Fence reads/starts/writes after DB errors, inode replacement, generation mismatch or closure. No PID/stale-timeout ownership heuristics.
3. Add numbered immutable SQL migrations with user_version updated transactionally, foreign keys/indexes/constraints and one canonical project per DB. Reject newer/foreign schema before semantic writes. Produce a consistent private pre-migration backup (including WAL) and bound backup count; no ORM or migration table.
4. Store sessions, runs, interactions, ordered events and one shared idempotency table outside the checkout using existing project paths/permissions. Run identity includes canonical taskId, taskCreatedAt and SHA-256 of exact raw task bytes. Recover nonterminal runs as unknown on a new ownership generation; never spawn or resume a process.
5. Enforce single-slot admission and lifecycle transitions atomically using RAC-04 helpers, scope interactions by run/generation and preserve RPC ID type. Provide bounded task/run/event history and session thread/turn mapping. Never mutate Markdown tasks from this store.
6. Add transactional idempotency hash/result reservation for synchronous database mutations; messages remain events. Retain only whole eligible terminal runs, protect unknown/active/open-interaction runs and preserve event sequences. Limit individual events to 64 KiB and project logical history to 100 MiB/30 days; per-run log limit emits one truncated marker and preserves a bounded control reserve, failing closed when exhausted.
7. Persist only allowlisted structured payloads and sanitized text; redact configured credential values and common token/header/key/password formats, reject raw provider errors/config objects. Document that assembled-item redaction and credential isolation still gate later streaming/API work rather than claiming detection of arbitrary unknown secrets.
8. Test real SQLite reopen/recovery, backup/migration rollback/newer schema, two-process exclusion/owner death/fencing, idempotency rollback/conflict/replay, historical task identity, redaction, truncation/reserve and protected whole-run retention. Run RAC regressions, types/lint/build; document exact limits and OS evidence; check only proven AC and commit locally, no push or next task.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented private external Bun SQLite persistence in src/rac/store.ts, store-schema.ts, store-payload.ts and store-types.ts; added real SQLite/process tests and docs/rac/PERSISTENCE.md, with architecture/development links.

AC evidence:
1/2/5: sessions/runs bind one canonical task, creation identity and exact raw-byte SHA-256 revision to one Codex session; typed RPC interaction identity, turn/thread mapping, ordered event and task history survive reopen. A native SIGKILL test preserves committed WAL data and recovers the run as unknown with its old generation; no process is auto-resumed.
3/6: immutable transactional user_version migration, application/project identity checks, one consistent private VACUUM INTO backup; rollback/repeat tests and newer-version preservation pass. Existing Backlog config handler remains usable after RAC rejects a newer schema.
4: allowlisted event/error inputs, configured-value and common credential-format redaction, credential-field rejection; only hashes of idempotency keys/requests persist. Tests include quoted JSON token assignment. Unknown secrets and cross-event fragments cannot be universally detected: later streaming must sanitize assembled logical items and supply known values before storing. No raw provider diagnostics/config payloads are accepted.
7: actual BEGIN EXCLUSIVE write plus retained EXCLUSIVE/WAL connection, tested against a second OS process. Generation/inode/private-file checks and unexpected read/write errors fence all later operations; async transaction callbacks roll back/fence. Store must be strongly retained and runtime must stop execution on failure. Descriptor/authenticated backend integration belongs to RAC-08.
8: one transactional idempotency table; no messages/migrations table; whole eligible terminal-run deletion, protected active/unknown/open/uncertain records, contiguous event paging, one truncated log marker and reserved control/state budget. Test covers audit exhaustion followed by restart and human resolution. Replay receipts and ID tombstones survive retention to prevent recreating expired mutations; logical limits exclude DB overhead/receipts/backup, documented explicitly.

Verification: scoped RAC regression 215 pass / 0 fail / 760 assertions across 14 files, including 22 new store/process tests. bun run check:types passes (583 files); bun run check passes (518 files). Bun bundles src/cli.ts (1541 modules) and src/rac/store.ts (12 modules); CLI bundle emits existing Tailwind at-rule warnings. git diff --check clean. Verified on macOS arm64, Bun 1.4.4 / SQLite 3.51.0. Linux execution not verified; native Windows fails closed pending ACL validation. No real Codex account, system prompt or network listener required for these persistence tests.

Scope: no endpoint, agent execution, task Markdown storage replacement, RAC enablement or UI changes. BACK-795 pre-existing ordinal change 405000 -> 1000 preserved and excluded from this task commit. Groma remains unavailable (command not found); no Groma-owned files changed. RAC-08 not started; no push.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added durable external SQLite run/session/interaction/event history with exclusive project ownership and fencing, atomic migrations/idempotency, restart recovery and protected bounded retention. Task Markdown remains authoritative. All eight AC and three DoD items verified by 215 scoped RAC tests, type/lint checks and CLI/store bundles. See docs/rac/PERSISTENCE.md for integration contracts and limits; runtime/API integration is next in RAC-08.
<!-- SECTION:FINAL_SUMMARY:END -->
