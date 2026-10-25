---
id: BACK-807
title: '[RAC-18] Autoryzacja aplikacji i zabezpieczenie API'
status: To Do
assignee: []
created_date: '2026-10-24T08:05:00Z'
updated_date: '2026-10-24T10:22:00Z'
labels:
  - rac
  - m3-remote-access
  - security
  - remote
dependencies:
  - BACK-791
  - BACK-797
  - BACK-803
  - BACK-805
documentation:
  - docs/rac/decisions/0001-rac-architecture.md
priority: high
ordinal: 417000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Dodaj warstwę autoryzacji backendu dla wszystkich endpointów RAC: polityka single-user, obsługa zaufanej tożsamości z reverse proxy z walidacją tokenu/headerów, CSRF dla mutacji, secure cookies jeśli stosowane, ograniczenie origin, rate limiting, audyt. Nie akceptuj niezweryfikowanych nagłówków tożsamości od klienta; odrzuć ruch spoza zaufanego proxy. Wybierz i udokumentuj konkretny model sesji.

Ustalenia po review ADR-0001 (2026-10-24; zaakceptowane przez użytkownika):
Auth obejmuje cały istniejący dashboard/API, WebSocket i SSE. Cookie nie izoluje portów: sesja związana z projectKey i generacją, test kolizji/wycieku między projektami. Tunel wymaga osobnego listenera z walidacją JWT gatewaya albo jednolitego uwierzytelnienia wszystkich żądań; nie rozpoznawaj zdalnego ruchu wyłącznie z IP loopback lub Host. Żaden poświadczeniowy kanał decisions nie jest osiągalny z sandboxa.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Nieautoryzowany klient nie uruchomi agenta ani nie zobaczy logów
- [ ] #2 API mutujące blokuje CSRF i nieprawidłowe origin
- [ ] #3 Zaufanie do tożsamości z Access jest weryfikowane po stronie serwera
- [ ] #4 Rate limit ogranicza próby i spam requestami
- [ ] #5 Testy obejmują brak i podrobione uwierzytelnienie
- [ ] #6 Testowany jest pełny zbiór tras i upgrade/stream; IP loopback i podstawiony Host nie omijają autoryzacji
- [ ] #7 Sesja/cookie jednego projektu nie uprawnia do sterowania innym projektem
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
