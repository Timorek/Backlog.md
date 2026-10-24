---
id: BACK-797
title: '[RAC-08] API: uruchom task z dashboardu'
status: To Do
assignee: []
created_date: '2026-10-24T08:05:00Z'
updated_date: '2026-10-24T10:22:00Z'
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
- [ ] #1 Poprawny task uruchamia Codexa w zadanym repo
- [ ] #2 Nieznany task zwraca kontrolowany błąd bez startu procesu
- [ ] #3 Dwukrotne kliknięcie z tym samym idempotency key nie tworzy 2 runów
- [ ] #4 Task description nie jest interpretowany jako komenda systemowa
- [ ] #5 W API nie można przekazać niestandardowych argumentów CLI
- [ ] #6 Istniejące HTML/API, WebSocket i SSE mają lokalne kontrole wejścia przed uruchomieniem procesu; odrzucone żądania nie mają skutków ubocznych
- [ ] #7 CLI start/status i API stosują ten sam lifecycle/idempotencję; zajęty slot daje 409 bez tworzenia kolejki
- [ ] #8 Agent najpierw zapisuje plan i oczekuje jego akceptacji; wczesny etap RAC-08 nie pozwala wykonać implementacji przed dostarczeniem interakcji RAC-13/14
- [ ] #9 RAC nie zmienia automatycznie statusu i assignee taska przy starcie
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 bun run check:types passes when TypeScript touched
- [ ] #2 bun run check . passes when formatting/linting touched
- [ ] #3 bun test (or scoped test) passes
<!-- DOD:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Sprawdz aktualny kod i kontrakty Backlog.md oraz Codex.
2. Napisz testy dla wymagan.
3. Zaimplementuj minimalny zakres zgodny z architektura.
4. Uruchom testy i zanotuj wynik w zadaniu.
<!-- SECTION:PLAN:END -->
