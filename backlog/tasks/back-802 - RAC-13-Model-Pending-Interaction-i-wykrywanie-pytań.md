---
id: BACK-802
title: '[RAC-13] Model Pending Interaction i wykrywanie pytań'
status: To Do
assignee: []
created_date: '2026-10-24T08:05:00Z'
updated_date: '2026-10-24T08:06:00Z'
labels:
  - rac
  - m2-dashboard
  - backend
  - interaction
  - mvp
dependencies:
  - BACK-792
  - BACK-796
  - BACK-798
  - BACK-799
priority: high
ordinal: 412000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Przechwytuj server-initiated requests requestUserInput i requestApproval. Każdą interakcję przechowuj po requestId, threadId, turnId, typ, opcje, termin ważności, status. Dla ogólnych pytań biznesowych zadziałaj zgodnie z wynikiem spike RAC-03: requestUserInput gdy obsługiwany lub jawne zatrzymanie po structured agent message i kontynuacja w następnej turze.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Question tworzy pozycję waiting_for_input i widoczną treść
- [ ] #2 Approval tworzy osobną pozycję waiting_for_approval
- [ ] #3 Stare lub już rozwiązane requesty nie mogą być ponownie zatwierdzone
- [ ] #4 Fallback pytań nie udaje aktywnego requestu app-server
- [ ] #5 Przejścia stanów i eventy mają testy
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
