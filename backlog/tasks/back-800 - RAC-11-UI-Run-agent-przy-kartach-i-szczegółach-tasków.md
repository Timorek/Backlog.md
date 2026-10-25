---
id: BACK-800
title: '[RAC-11] UI: Run agent przy kartach i szczegółach tasków'
status: To Do
assignee: []
created_date: '2026-10-24T08:05:00Z'
updated_date: '2026-10-24T10:22:00Z'
labels:
  - rac
  - m2-dashboard
  - frontend
  - mvp
dependencies:
  - BACK-797
  - BACK-798
documentation:
  - docs/rac/decisions/0001-rac-architecture.md
priority: high
ordinal: 410000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Do istniejącej tablicy dodaj akcję Run agent na karcie i w widoku taska. Pokaż projekt roboczy, aktualną aktywność, ostrzeżenie o lokalnym uruchomieniu kodu i potwierdzenie. Zablokuj wielokrotne starty z tego samego UI. Nie modyfikuj semantyki kolumn Kanban.

Ustalenia po review ADR-0001 (2026-10-24; zaakceptowane przez użytkownika):
Q5=A: nie pokazuj queued w MVP. Przy zajętym slocie obsłuż 409 run_active bez dodatkowego runa. Odznaki opierają się o GET /api/rac/runs/latest i invalidation rac-updated w istniejącym WebSockecie. Waiting to widok wyliczany z blokujących interakcji, nie osobne statusy bazy. UI korzysta z semantyk CLI/API z RAC-08; nie omija fazy planowania i zatwierdzenia planu.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Akcja widoczna na desktop i mobile
- [ ] #2 Kliknięcie start tworzy dokładnie jedno uruchomienie
- [ ] #3 Wyświetlany jest lifecycle runa i wyliczone oczekiwanie; zajęty slot daje 409 run_active, bez queued w MVP
- [ ] #4 Widać komunikaty API oraz brak połączenia z hostem runnera
- [ ] #5 Widok istniejącej tablicy zachowuje dotychczasowe funkcje
- [ ] #6 Odznaki aktualizują się przez rac-updated i runs/latest, bez drugiego Kanbana
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
