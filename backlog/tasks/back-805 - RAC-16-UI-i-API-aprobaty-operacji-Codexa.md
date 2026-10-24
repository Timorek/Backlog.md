---
id: BACK-805
title: '[RAC-16] UI i API: aprobaty operacji Codexa'
status: To Do
assignee: []
created_date: '2026-10-24T08:05:00Z'
updated_date: '2026-10-24T08:06:00Z'
labels:
  - rac
  - m2-dashboard
  - security
  - frontend
  - interaction
  - mvp
dependencies:
  - BACK-802
  - BACK-803
  - BACK-804
priority: high
ordinal: 415000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Obsłuż requestApproval dla komend, zmian plików i uprawnień w oparciu o schema app-server. Wyświetl polecenie, cwd, zakres zmian i powód. Zapewnij Approve once / Reject / Cancel, bez automatycznego blanket approve. Zmiana dozwolonych uprawnień musi być jawna i ograniczona.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Użytkownik widzi co zatwierdza zanim kliknie Approve
- [ ] #2 Reject odsyła poprawną decyzję do app-server
- [ ] #3 Nie pokazuje opcji niedozwolonych w availableDecisions
- [ ] #4 Po wygaśnięciu requestu przyciski są nieaktywne
- [ ] #5 Domyślna polityka nie pomija zgód
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
