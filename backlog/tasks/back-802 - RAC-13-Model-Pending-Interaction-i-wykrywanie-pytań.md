---
id: BACK-802
title: '[RAC-13] Model Pending Interaction i wykrywanie pytań'
status: To Do
assignee: []
created_date: '2026-10-24T08:05:00Z'
updated_date: '2026-10-24T10:23:00Z'
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
documentation:
  - docs/rac/decisions/0001-rac-architecture.md
priority: high
ordinal: 412000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Przechwytuj server-initiated requests requestUserInput i requestApproval. Każdą interakcję przechowuj po requestId, threadId, turnId, typ, opcje, termin ważności, status. Dla ogólnych pytań biznesowych zadziałaj zgodnie z wynikiem spike RAC-03: requestUserInput gdy obsługiwany lub jawne zatrzymanie po structured agent message i kontynuacja w następnej turze.

Ustalenia po review ADR-0001 (2026-10-24; zaakceptowane przez użytkownika):
Uwzględnij isBlocking, mcp_elicitation oraz open/answered/cleared/expired/uncertain/stale. serverRequest/resolved bez wysłanej odpowiedzi oznacza cleared, nie answered; wysłanie bez potwierdzenia może dać uncertain. Nieobsługiwane requesty dostają błąd RPC. Oczekiwanie wyliczaj wyłącznie z interakcji blokujących. Q2=A: faza planowania kończy się pytaniem o akceptację zapisanego planu; wykonanie dopiero po poprawnej odpowiedzi. Fallback po RAC-03 tworzy nową turę w tym samym runie.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Blokujące Question daje wyliczony widok waiting_for_input i widoczną treść; nieblokujące nie zatrzymuje runa
- [ ] #2 Approval tworzy osobną interakcję i wyliczony widok waiting_for_approval, bez utrwalania osobnego statusu runa
- [ ] #3 Stare lub już rozwiązane requesty nie mogą być ponownie zatwierdzone
- [ ] #4 Fallback pytań nie udaje aktywnego requestu app-server
- [ ] #5 Przejścia stanów i eventy mają testy
- [ ] #6 Testy odróżniają pytanie blokujące i nieblokujące oraz cleared/uncertain/stale
- [ ] #7 Istnieje jawna interakcja przeglądu planu, której brak odpowiedzi nie jest akceptacją
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
