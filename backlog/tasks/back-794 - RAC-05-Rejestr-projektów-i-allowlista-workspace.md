---
id: BACK-794
title: '[RAC-05] Rejestr projektów i allowlista workspace'
status: Done
assignee:
  - '@codex'
created_date: '2026-10-24T08:05:00Z'
updated_date: '2026-10-24T17:59:00Z'
labels:
  - rac
  - m1-local-mvp
  - backend
  - security
  - mvp
dependencies:
  - BACK-791
  - BACK-793
documentation:
  - docs/rac/decisions/0001-rac-architecture.md
  - docs/rac/PROJECT-CONFIGURATION.md
priority: high
ordinal: 404000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Dodaj konfigurację katalogów repozytoriów dostępnych agentowi. W MVP obsłuż jeden projekt; bez abstrakcji wielu projektów w MVP. Ścieżek nie wolno podawać bezpośrednio z requestu WWW. Backend wybiera katalog wyłącznie z konfiguracji allowlisty. Odrzuć path traversal i linki wychodzące poza root.

Ustalenia po review ADR-0001 (2026-10-24; zaakceptowane przez użytkownika):
Q1=A: MVP ma jeden kanoniczny root powiązany z projectKey; żądania klienta nie wskazują dowolnego projectId/cwd. Dodaj kanoniczne lokalne polecenia backlog rac enable/disable; ustawienia i zgoda na włączenie są poza repo, wymagają autoryzacji lokalnego człowieka. Repo config ani PUT /api/config nie mogą włączyć RAC lub osłabić polityki. Po przeniesieniu repo powstaje nowa historia (Q7g), bez relinkowania w MVP.

Późniejsza jawna zmiana użytkownika: lokalne rac enable/disable otrzymują --skip-system-auth, pomijające systemowe potwierdzenie bez nadawania praw administratora OS. Zastępuje to poprzednie bezwarunkowe wymaganie obecności człowieka przy włączeniu. Domyślne komendy nadal wymagają potwierdzenia; ustawienia repo i API nie mogą ustawić bypassu. Proces z prawem zapisu konfiguracji może użyć flagi, również agent z takimi prawami.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Backend odczytuje jedną skonfigurowaną ścieżkę projektu
- [x] #2 Walidacja blokuje niezgodny projectKey, nieuprawnioną sesję oraz wyjście poza skonfigurowany katalog
- [x] #3 Backend nigdy nie używa ścieżki z payloadu żądania jako cwd
- [x] #4 Testy obejmują nieprawidłowe i względne ścieżki
- [x] #5 CLI enable/disable jest dostarczone przed adapterem UI; domyślnie wymaga autoryzacji systemowej. Jawna lokalna flaga --skip-system-auth pomija ten krok na żądanie użytkownika, bez nadawania uprawnień OS; konfiguracja repo i API nie mogą jej ustawić.
- [x] #6 Sesja, żądania i deskryptor właściciela są związane z projectKey kanonicznego root, bez wyboru dowolnej ścieżki z API
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 bun run check:types passes when TypeScript touched
- [x] #2 bun run check . passes when formatting/linting touched
- [x] #3 bun test (or scoped test) passes
<!-- DOD:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Resolve the current project through the existing CLI/Core root. Canonicalize the root with realpath, derive SHA-256 projectKey and reject invalid/relative/traversal paths and escaping workspace symlinks.
2. Load strict, private, external settings; default to disabled. Keep repository config and the config API unable to enable RAC or set the CLI bypass. Use atomic writes and revalidate identities.
3. Provide local rac enable/disable. Default to fresh macOS LocalAuthentication; per later explicit user instruction, allow --skip-system-auth without OS elevation. Keep Windows ACL access fail-closed. Do not add a persistent compiler cache.
4. Wire BacklogServer.authorizeRacWorkspace to fresh local settings reads for the root held by its Core. Validate already-authenticated server-side session and owner records against projectKey/root/generation; return only the configured cwd. Do not accept a request-selected path.
5. Verify this actual backend boundary without opening sockets: disabled/revoked settings, missing or mismatched session, stale owner, malicious extra path fields, another server/project, root symlink replacement and escaping paths; verify PUT /api/config cannot enable RAC. Keep actual session issuance, lock acquisition and execution routes in RAC-07/08 as previously scoped.
6. Run RAC and ordinary dashboard-handler regressions, type checks, Biome and build. Record user-verified native enablement and the trust boundary in docs/rac. Check proven AC, set Done, and commit only this task locally. Do not start RAC-06 or push automatically.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
RAC-05 progress: implemented src/rac/project-context.ts and project-settings.ts plus tests. Canonical root/SHA-256 identity, absolute/traversal/symlink validation, trusted session/owner project-generation binding, disabled-by-default external settings reader, strict schema/identity/POSIX permission checks, no repository-config enablement. Documentation: docs/rac/PROJECT-CONFIGURATION.md. Verification: 110 tests / 367 assertions across four RAC test files PASS; type check 562 files PASS; full Biome check 490 files PASS. No AC checked and task remains In Progress. Awaiting explicit architectural/workflow decision required by task-execution step 7: native macOS LocalAuthentication (Touch ID/system account password, fresh LAContext, no bypass flags) for local rac enable/disable, unsupported platforms fail closed. Authorization writer and CLI commands deliberately not implemented before that decision. No push or next task.

User approved native macOS authorization. Implemented backlog rac enable/disable through the existing project resolver, with no bypass flags or web enable endpoint. Fresh LAContext/deviceOwnerAuthentication/zero Touch ID reuse; fixed embedded Swift helper via absolute system tool and minimal environment; no password capture. Added atomic private settings writer with authorization before mutation and root/data revalidation afterwards. Verification: 121 tests, 403 assertions, 5 RAC files PASS; full type check 565 files PASS; Biome 493 files PASS; CLI build and compiled rac help PASS; Swift helper SDK type-check PASS; git diff --check PASS. Real helper attempted in this restricted session: canEvaluatePolicy returned unavailable, helper exit 1, no settings change attempted. Native positive authentication and cancellation remain to verify in a normal macOS Terminal. Keep task In Progress, do not claim full HTTP/session authentication: this task supplies shared context guards; handlers and real authenticated session/ownership records remain gated in subsequent tasks per approved plan. Preserve unproven AC unchecked until final review/manual verification. No push or next task.

User observed the native authentication dialog and cancelled it. Current local settings read enabled=false; successful native confirmation remains unverified. User explicitly declined persistent compiler caching as unnecessary for this rarely used operation; experimental cache changes were removed before commit. Keep the existing temporary helper/cache, fresh authentication and no bypass. Add only a CLI notice that opening the system dialog may take tens of seconds.

Follow-up verification after removing cache optimization: 5 CLI tests / 12 assertions PASS, CLI rebuild PASS, Biome for the changed CLI file PASS, git diff --check PASS. Only the startup-delay notice and this task record differ from the previous commit. No native authorization or settings behavior changed.

Added --skip-system-auth (recommended clearer name than --admin) to both local enable/disable commands at explicit user request. Default still invokes the native authorizer; skip mode never invokes it, keeps path/root/private-file/atomic-write checks, and grants no OS elevation. No repo config, web flag, permanent compiler cache or Windows ACL bypass. Updated ADR, AGENTS.md and development/config docs to remove the old unconditional human-presence guarantee. Tests: CLI/default-versus-skip round trips plus writer guards; 125 tests / 424 assertions across 5 RAC files PASS; types 565 files PASS, Biome 493 files PASS, source build and compiled help PASS, diff check PASS. Earlier user password entry was verified via actual local enabled=true, but no real project setting was changed during these flag tests. Remaining backend integration ACs stay unchecked; no next task or push.

Completion evidence for remaining RAC-05 criteria:
AC1: actual BacklogServer.authorizeRacWorkspace loads settings from its existing Core root on every call; enable/disable/revocation and second-project cases pass.
AC2: backend integration tests reject missing sessions, different projectKey/root and stale owner generation; workspace resolver rejects traversal/symlink escapes. Session records must already be authenticated server-side; this task does not claim login/session issuance.
AC3: the backend guard has no client cwd/path/projectId parameter, returns only configured canonicalRoot; malicious extra request-like fields do not change the returned cwd.
AC6: the real backend validates the trusted session and owner records against its configured project identity and generation. Lock acquisition and authenticated HTTP dispatch are explicit caller obligations for RAC-07/08, not implemented or claimed here.
AC4/5 remain verified from earlier path and CLI tests, including the explicitly user-approved skip-system-auth option. Existing config handler test proves its payload cannot enable RAC or apply that option.
Verification: 137 tests, 464 assertions across 8 files PASS (RAC plus ordinary server init/task-project handlers); types 566 files PASS; Biome 494 files PASS; CLI build PASS; diff check PASS. Native enablement was previously confirmed by reading enabled=true after user entered their password. No RAC endpoint or agent process was added. Groma is still unavailable; its files were not changed. RAC-06 has not been started.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Completed local RAC project configuration and integrated the workspace authorization boundary into BacklogServer. Fresh settings reads bind canonical cwd, projectKey, authenticated session record and owner generation; invalid identities, revocation and path escapes are rejected. Local enable/disable defaults to macOS authentication with the explicitly approved skip-system-auth exception. 137 scoped tests, types, lint and build pass. Runtime login, lock ownership and execution endpoints remain in RAC-07/08; matching fields alone are not authentication. No push or RAC-06 work.
<!-- SECTION:FINAL_SUMMARY:END -->
