---
id: BACK-811
title: '[RAC-22] Izolacja zmian Git worktree per Run'
status: To Do
assignee: []
created_date: '2026-10-24T08:06:00Z'
updated_date: '2026-10-24T08:06:00Z'
labels:
  - rac
  - m4-advanced
  - git
  - advanced
dependencies:
  - BACK-797
  - BACK-799
  - BACK-810
priority: medium
ordinal: 421000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Dla każdego runu twórz odizolowany git worktree i branch rac/<runId> zamiast współdzielenia jednego katalogu roboczego. Waliduj czysty stan wyjściowy, referencję do bazy oraz uprawnienia. Sprzątaj worktree po świadomym zatwierdzeniu albo przez bezpieczny mechanizm cleanup. Ogranicz rozmiary i liczbę worktree.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Dwa runy nie modyfikują tego samego working tree
- [ ] #2 Zmiany pozostają dostępne do przeglądu po zakończeniu
- [ ] #3 Cleanup nie usuwa niezacommitowanych zmian bez potwierdzenia
- [ ] #4 Błędne repo/branch nie uruchamia agenta
- [ ] #5 Testy obejmują konflikt branch i porzucony worktree
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
