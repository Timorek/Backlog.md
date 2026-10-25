---
id: BACK-799
title: '[RAC-10] Lifecycle: cancel i odzyskiwanie po awarii'
status: To Do
assignee: []
created_date: '2026-10-24T08:05:00Z'
updated_date: '2026-10-25T13:07:00Z'
labels:
  - rac
  - m1-local-mvp
  - lifecycle
  - mvp
dependencies:
  - BACK-796
  - BACK-797
  - BACK-798
documentation:
  - docs/rac/decisions/0001-rac-architecture.md
priority: high
ordinal: 409000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Dodaj POST cancel dla aktywnego runu z użyciem turn/interrupt, potwierdź zatrzymanie po zdarzeniu z serwera. Przy ponownym uruchomieniu backendu odczytaj dane runów; odróżnij możliwość thread/resume od utraconej aktywnej tury. Nie pokazuj niezweryfikowanego stanu running. Domyślne recovered run=unknown/requires_review.

Ustalenia po review ADR-0001 (2026-10-24; zaakceptowane przez użytkownika):
Q1=A: dostarcz CLI cancel/resume/resolve razem z odpowiadającym API. unknown nie jest terminalny i zajmuje slot do jawnego resolve człowieka do abandoned; brak automatycznego wznowienia i brak zabijania obcego PID. Resume tworzy nowy run w tej samej Session. Wygaśnięcie blokującej interakcji przerywa turę, a przerwanie wymaga potwierdzenia; brak dowodu oznacza unknown. Restart backendu/launchd/bun --watch stosuje ten sam recovery.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Przycisk cancel zatrzymuje aktywną turę i status jest poprawny
- [ ] #2 Drugi cancel nie wywołuje niekontrolowanego błędu
- [ ] #3 Crash procesu przełącza run w unknown lub failed z opisem
- [ ] #4 Restart backendu nie tworzy podwójnego uruchomienia
- [ ] #5 Testy obejmują brak odpowiedzi app-server
- [ ] #6 CLI i API obsługują cancel/resume/resolve zgodnie ze wspólną idempotencją i autoryzacją
- [ ] #7 unknown zwalnia slot wyłącznie po świadomym rozstrzygnięciu przez człowieka; stale approvals nie są odtwarzane
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

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
PR #1 review fix BACK-818 delivers the authenticated/idempotent CLI/API resolve path early: explicit previous-process-stop confirmation, no process killing or automatic resume; unknown -> abandoned, terminal stale requests can be retired. RAC-10 remains To Do for its remaining cancel/resume/lifecycle requirements. Revalidate its plan when picking it up.
<!-- SECTION:NOTES:END -->
