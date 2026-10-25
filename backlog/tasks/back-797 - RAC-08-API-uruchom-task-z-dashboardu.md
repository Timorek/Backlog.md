---
id: BACK-797
title: '[RAC-08] API: uruchom task z dashboardu'
status: Done
assignee:
  - '@codex'
created_date: '2026-10-24T08:05:00Z'
updated_date: '2026-10-25T07:01:00Z'
labels:
  - rac
  - m1-local-mvp
  - backend
  - api
  - mvp
dependencies:
  - BACK-794
  - BACK-795
  - BACK-796
documentation:
  - docs/rac/decisions/0001-rac-architecture.md
  - docs/rac/LOCAL-API.md
  - docs/rac/spikes/rac-08-terminal-live-success.json
priority: high
ordinal: 407000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Dodaj POST /api/rac/runs z taskId i expectedTaskRevision. Backend pobiera treść taska poprzez istniejący moduł Backlog/CLI zamiast ufać treści przesłanej z przeglądarki. Uruchamia sesję Codexa w allowlistowanym repo, przekazuje opis, AC i instrukcje weryfikacji. Na start tylko jedna aktywna sesja; zajęty slot daje 409 run_active bez kolejki.

Ustalenia po review ADR-0001 (2026-10-24; zaakceptowane przez użytkownika):
Uzgodnienia Q1–Q5: udostępnij CLI start/status razem z API, przed UI RAC-11. Projekt pochodzi z lokalnej konfiguracji właściciela, nie dowolnego projectId w body. Jeden Idempotency-Key dla mutacji; ponownie odczytaj task/readiness i expectedTaskRevision. Zajęty slot daje 409 run_active, bez queued. Manager nie zmienia statusu/assignee taska; agent robi to przez CLI. Start przekazuje fazę planowania i regułę akceptacji planu. Do dostarczenia pytań/odpowiedzi RAC-13/14 nie udostępniaj przejścia do implementacji; nie twórz cyklicznej zależności tasków. Przed pierwszym handlerem wykonania dostarcz wspólną kontrolę Host/Origin/Content-Type wszystkich istniejących tras, sesję/autoryzację związaną z projectKey oraz CSRF dla cookie. Chronienie samego fallback fetch nie wystarcza dla natywnych routes Bun. Domyślnie on-request i approvalsReviewer=user; nie da się przekazać słabszej polityki z UI. Done pozostaje decyzją człowieka (konwencja promptu i audyt w MVP).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Poprawny task uruchamia Codexa w zadanym repo
- [x] #2 Nieznany task zwraca kontrolowany błąd bez startu procesu
- [x] #3 Dwukrotne kliknięcie z tym samym idempotency key nie tworzy 2 runów
- [x] #4 Task description nie jest interpretowany jako komenda systemowa
- [x] #5 W API nie można przekazać niestandardowych argumentów CLI
- [x] #6 Istniejące HTML/API, WebSocket i SSE mają lokalne kontrole wejścia przed uruchomieniem procesu; odrzucone żądania nie mają skutków ubocznych
- [x] #7 CLI start/status i API stosują ten sam lifecycle/idempotencję; zajęty slot daje 409 bez tworzenia kolejki
- [x] #8 Agent najpierw zapisuje plan i oczekuje jego akceptacji; wczesny etap RAC-08 nie pozwala wykonać implementacji przed dostarczeniem interakcji RAC-13/14
- [x] #9 RAC nie zmienia automatycznie statusu i assignee taska przy starcie
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 bun run check:types passes when TypeScript touched
- [x] #2 bun run check . passes when formatting/linting touched
- [x] #3 bun test (or scoped test) passes
<!-- DOD:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Verify RAC-05/06/07 dependencies, assign BACK-797 In Progress and preserve unrelated BACK-795 ordering. Record user-approved one-time pairing (rac pair -> short-lived one-use dashboard code -> project/owner-bound cookie; CLI uses private credential). No automatic enable, push or next task.
2. Add shared loopback request policy covering actual native API routes, fallback, HTML/assets and WS/SSE: exact Host/port, same-origin mutations/upgrades/streams, JSON mutations, fetch-metadata checks and bounded input. Native HTMLBundle cannot be wrapped by fallback: use the existing bundle manifest or an in-memory build of the SAME frontend behind guarded handlers. Disable native dev-server bypass/HMR on the guarded listener; retain source restart/rebuild workflow and document this limitation.
3. Add private owner discovery credentials after SQLite ownership, bounded pairing attempts/expiry/one-use code, project/generation-bound HTTP sessions, HttpOnly project-specific SameSite cookie and CSRF for cookie mutations; CLI authenticates by header, never URL/argv. Pair UI is a small built-in authentication page in the existing dashboard, not another Kanban. All later answer/decide credentials remain gated on runtime isolation; no decision endpoint in RAC-08.
4. Implement the internal Agent Manager using current Core task lookup/readiness, raw revision, RAC settings/context, RacStore and CodexAdapter. Validate local unique actionable task and dependencies, containment, revision, Git-operation state and strict allowlisted request before reservation/dispatch. Recheck immediately before provider start. Transactional idempotency reserves one run; same key replays; busy ->409 run_active, no queue or automatic task status/assignee changes.
5. Launch only the planning phase with task text as RPC data, bounded developer rules and workspace-write/on-request/user policy already verified in RAC-06. Require plan through existing CLI then stop for human review; no API/CLI continuation/implementation operation until RAC-13/14. Deny unsupported server questions/approvals safely; do not grant additional permissions or silently continue. Persist bounded sanitized planning output/state, close adapter on terminal/disconnect/shutdown/fencing; uncertain cleanup -> unknown.
6. Integrate lazy enabled-only owner startup with BacklogServer lifecycle; another owner/newer schema leaves ordinary Kanban usable. Add POST /api/rac/runs, GET /api/rac/runs/:id and task revision/history sufficient for CLI start/status, plus pairing/bootstrap endpoints. Canonical rac start/status call same authenticated owner API via validated private descriptor; no manager in CLI invocation.
7. Add meaningful negative routing/auth/session/CSRF/pairing tests, fixture-based manager/CLI/API tests for identity/readiness/revision/idempotency/concurrency/prompt boundaries and shutdown. Exercise real Bun request paths where ports permit; record restrictions accurately and provide an executable local smoke when necessary. Real provider planning check remains separate from fixture protocol tests.
8. Run relevant RAC/server/web regressions, types, Biome and source/packaged bundles. Document commands, auth/trust/plan limitations and evidence; inspect full diff, check only proven criteria and commit scoped work locally. If a runtime/platform gate cannot be demonstrated, leave the task In Progress with the exact blocker rather than mark Done.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented the local Agent Manager, POST /api/rac/runs, run status/task revision history, canonical rac start/status and user-approved rac pair. Private owner descriptor is published only after SQLite ownership; one-use codes establish owner/project-bound HttpOnly/SameSite cookies, CSRF protects cookie mutations, and CLI uses private header credentials. Native API routes, guarded frontend/asset handlers and fallback/WS/event-stream paths share Host/Origin/JSON checks before side effects. Existing task semantics are reused; manager never edits status or assignee.

AC evidence:
1: User ran scripts/rac/rac-api-smoke.ts --live in normal macOS Terminal on 2026-10-25. Real HTTP and Codex turn completed in the isolated project; planSaved=true, noImplementationFile=true, taskNotDone=true, ok=true. Exact JSON retained at docs/rac/spikes/rac-08-terminal-live-success.json.
2/4/5: Manager tests reject unknown, blocked and completed tasks, stale revision and arbitrary args/cwd/project/policy/phase/model fields before launch. Task Markdown goes only into text RPC input, not executable argv or shell interpolation. Raw task SHA and readiness are reread before reservation and provider startup; existing Git operation guard is reused.
3/7: Transactional run/session/idempotency reservation; concurrent identical requests replay one result, even after agent edits the task; changed input conflicts. Different key while busy ->409 run_active; no queue. CLI start/status integration uses the same authenticated HTTP service and owner rather than creating another manager. Real HTTP smoke verifies idempotentStart and busy409.
6: Configured native route callback tests cover HTML, generated assets, mutation rejection before task creation, foreign WS/SSE and fallback. DOM test submits the real pairing form. User real HTTP smoke confirms guardedHtmlAssetsAndApi, foreignStreamsRejected and pairingAndCsrf. Browser session bootstrap returns CSRF only to its authenticated cookie. Private descriptor permissions, pairing expiry/attempt count, cookie expiry and identity/CSRF rejection are tested. All generated auth secrets are registered for redaction before persistence.
8/9: Only one planning turn is exposed; no resume/messages/answer/decision/implementation route. Developer rules require task plan via existing CLI and stop for human review; questions interrupt and approvals are declined. Fixture verifies no manager task mutations; real run saved a plan and left the task unfinished without creating the implementation file. Workspace-write still permits project writes: the planning contract is a workflow rule plus absence of continuation, not a read-only filesystem or proof against arbitrary prompt injection. Human-decision credential isolation remains a gate for RAC-13/14/16; no such command is implemented here.

Final verification: 241 pass /0 fail /879 assertions across20 files (RAC plus existing SPA-cache and web API client regressions); check:types passes592 files; Biome check passes528 files; git diff --check clean. Official scripts/build.ts built the native executable /tmp/rac08-backlog; --version1.55.3 and rac start --help work. Separate bundled JS and native compiled renderer both served the HTML entry and3 nonempty assets, including nested-route URL rewriting. Restricted-session live smoke preflight reports listener_unavailable; the supplied successful user Terminal result is recorded separately rather than treating fixture/network interception as real HTTP proof.

Development change: native Bun HTMLBundle/HMR auto-routes bypass request middleware, so the same existing frontend is served from guarded source-build or packaged-manifest responses; native HMR is disabled, backend watch still works and frontend edits need a restart. Task Markdown retains the existing live ContentStore/WebSocket workflow. See docs/rac/LOCAL-API.md and updated DEVELOPMENT/ARCHITECTURE/ADR for current boundaries.

No second app/Kanban, no Run buttons (RAC-11), no SSE/log delivery (RAC-09), no public tunnel/auth claims or native Windows support. Existing project RAC settings were not changed; temporary fixture settings are removed. Groma is unavailable, no Groma-owned files changed. Preserve and exclude the pre-existing BACK-795 ordinal405000->1000. Local scoped commit only; no push and no automatic RAC-09 work.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added authenticated local planning runs to the existing backend: one-time pairing, project/owner-bound sessions with CSRF, shared loopback guards for current routes/frontend/assets, CLI start/status and atomic idempotent manager dispatch. User real HTTP/Codex smoke succeeded with a saved plan and no implementation/Done change. Verified all9 AC and3 DoD with241 scoped tests, types/lint and official native build. Native HMR is disabled for guarded bundle serving; frontend changes require restart. See docs/rac/LOCAL-API.md for commands and trust boundaries; next is RAC-09, not started.
<!-- SECTION:FINAL_SUMMARY:END -->
