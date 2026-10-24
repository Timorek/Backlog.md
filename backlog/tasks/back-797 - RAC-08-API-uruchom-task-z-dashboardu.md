---
id: BACK-797
title: '[RAC-08] API: uruchom task z dashboardu'
status: To Do
assignee: []
created_date: '2026-10-24T08:05:00Z'
updated_date: '2026-10-24T08:06:00Z'
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
priority: high
ordinal: 407000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Dodaj POST /api/rac/runs z taskId i projectId. Backend pobiera treść taska poprzez istniejący moduł Backlog/CLI zamiast ufać treści przesłanej z przeglądarki. Uruchamia sesję Codexa w allowlistowanym repo, przekazuje opis, AC i instrukcje weryfikacji. Na start tylko jedna aktywna sesja i jawny status queued, jeśli zasób zajęty.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Poprawny task uruchamia Codexa w zadanym repo
- [ ] #2 Nieznany task zwraca kontrolowany błąd bez startu procesu
- [ ] #3 Dwukrotne kliknięcie z tym samym idempotency key nie tworzy 2 runów
- [ ] #4 Task description nie jest interpretowany jako komenda systemowa
- [ ] #5 W API nie można przekazać niestandardowych argumentów CLI
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
