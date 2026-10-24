---
id: BACK-801
title: '[RAC-12] UI: widok Run detail i live logs'
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
  - BACK-798
  - BACK-799
  - BACK-800
priority: high
ordinal: 411000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Dodaj panel szczegółów uruchomienia z osią zdarzeń, logami, statusem i akcją Stop. Pozwól przechodzić z taska do historii runów. Ukryj dane wrażliwe, escape HTML i obsługuj przewijanie długich logów.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Panel pokazuje bieżące i poprzednie runy taska
- [ ] #2 Logi aktualizują się bez refresh i bez duplikatów
- [ ] #3 Stop ma wymagane potwierdzenie i stan loading
- [ ] #4 Widok nadaje się do telefonu 360px szerokości
- [ ] #5 Niesprawny streaming przechodzi w stan reconnect
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
