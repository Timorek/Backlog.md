---
id: BACK-799
title: '[RAC-10] Lifecycle: cancel i odzyskiwanie po awarii'
status: To Do
assignee: []
created_date: '2026-10-24T08:05:00Z'
updated_date: '2026-10-24T08:06:00Z'
labels:
  - rac
  - m1-local-mvp
  - lifecycle
  - mvp
dependencies:
  - BACK-796
  - BACK-797
  - BACK-798
priority: high
ordinal: 409000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Dodaj POST cancel dla aktywnego runu z użyciem turn/interrupt, potwierdź zatrzymanie po zdarzeniu z serwera. Przy ponownym uruchomieniu backendu odczytaj dane runów; odróżnij możliwość thread/resume od utraconej aktywnej tury. Nie pokazuj niezweryfikowanego stanu running. Domyślne recovered run=unknown/requires_review.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Przycisk cancel zatrzymuje aktywną turę i status jest poprawny
- [ ] #2 Drugi cancel nie wywołuje niekontrolowanego błędu
- [ ] #3 Crash procesu przełącza run w unknown lub failed z opisem
- [ ] #4 Restart backendu nie tworzy podwójnego uruchomienia
- [ ] #5 Testy obejmują brak odpowiedzi app-server
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
