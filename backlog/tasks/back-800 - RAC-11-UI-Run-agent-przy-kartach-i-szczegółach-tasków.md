---
id: BACK-800
title: '[RAC-11] UI: Run agent przy kartach i szczegółach tasków'
status: To Do
assignee: []
created_date: '2026-10-24T08:05:00Z'
updated_date: '2026-10-24T08:06:00Z'
labels:
  - rac
  - m2-dashboard
  - frontend
  - mvp
dependencies:
  - BACK-797
  - BACK-798
priority: high
ordinal: 410000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Do istniejącej tablicy dodaj akcję Run agent na karcie i w widoku taska. Pokaż projekt roboczy, aktualną aktywność, ostrzeżenie o lokalnym uruchomieniu kodu i potwierdzenie. Zablokuj wielokrotne starty z tego samego UI. Nie modyfikuj semantyki kolumn Kanban.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Akcja widoczna na desktop i mobile
- [ ] #2 Kliknięcie start tworzy dokładnie jedno uruchomienie
- [ ] #3 Wyświetlane są stany queued/running/failed/completed
- [ ] #4 Widać komunikaty API oraz brak połączenia z hostem runnera
- [ ] #5 Widok istniejącej tablicy zachowuje dotychczasowe funkcje
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
