---
id: BACK-804
title: '[RAC-15] UI: pytania agenta i rozmowa w tasku'
status: To Do
assignee: []
created_date: '2026-10-24T08:05:00Z'
updated_date: '2026-10-24T10:22:00Z'
labels:
  - rac
  - m2-dashboard
  - frontend
  - interaction
  - mvp
dependencies:
  - BACK-801
  - BACK-802
  - BACK-803
documentation:
  - docs/rac/decisions/0001-rac-architecture.md
priority: high
ordinal: 414000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
W widoku taska dodaj sekcję Agent Conversation: tekst pytania, opcje wyboru / pole tekstowe, przycisk Send, informację o stanie sesji i historię decyzji. Wskazuj czy agent realnie czeka na request czy oczekuje na kolejną turę. Zapobiegaj podwójnym odpowiedziom.

Ustalenia po review ADR-0001 (2026-10-24; zaakceptowane przez użytkownika):
Pytanie nieblokujące jest widoczne, ale nie zatrzymuje runa. Wyświetl osobno pytanie o akceptację planu i powiąż odpowiedź z właściwą interakcją; wiadomość czatu nie stanowi zgody. Wiele blokujących pytań/approvals nie nadpisuje wzajemnie prezentowanego oczekiwania.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Pytania są czytelne i możliwe do obsłużenia na telefonie
- [ ] #2 Zapis odpowiedzi aktualizuje widok bez przeładowania
- [ ] #3 Obsługiwane są odpowiedzi tekstowe i wybór opcji
- [ ] #4 Widać historię wiadomości po odświeżeniu
- [ ] #5 Ekran rozróżnia waiting i running
- [ ] #6 Pytania nieblokujące nie dają fałszywego statusu oczekiwania; przegląd planu ma jawne akcje odpowiedzi
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
