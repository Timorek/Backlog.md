---
id: BACK-793
title: '[RAC-04] Kontrakt stanów i testowy szkielet RAC'
status: To Do
assignee: []
created_date: '2026-10-24T08:05:00Z'
updated_date: '2026-10-24T10:22:00Z'
labels:
  - rac
  - m0-discovery
  - domain
  - tests
  - mvp
dependencies:
  - BACK-791
  - BACK-792
documentation:
  - docs/rac/decisions/0001-rac-architecture.md
priority: high
ordinal: 403000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Zdefiniuj stany starting/running/interrupting/interrupted/completed/failed/unknown/abandoned; oczekiwanie wyliczane z interakcji. Oddziel status taska Backlog.md od statusu konkretnego uruchomienia: jeden task może mieć wiele runów. Postaw testy jednostkowe kontraktów i atrapę adaptera umożliwiającą testowanie UI bez prawdziwego Codexa.

Ustalenia po review ADR-0001 (2026-10-24; zaakceptowane przez użytkownika):
Q5=A i Q7f: przechowuj lifecycle starting/running/interrupting/interrupted/completed/failed/unknown/abandoned. Oczekiwanie na input/approval wyliczaj ze zbioru otwartych interakcji blokujących; pytania nieblokujące nie zatrzymują runa. unknown zajmuje slot, dopóki człowiek nie rozstrzygnie go do abandoned. Brak queued i kolejki w MVP; drugi start daje 409 run_active. Uzgodnij stany z wynikami RAC-03.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Zapisano dozwolone przejścia stanów i przypadki błędne
- [ ] #2 Testy sprawdzają idempotentne zmiany statusu i mapowanie task -> run
- [ ] #3 Mock agent umie emitować tekst pytanie approval sukces i błąd
- [ ] #4 Restart aplikacji nie jest modelowany jako sukces uruchomienia
- [ ] #5 Brak queued w MVP; zajęty slot zwraca 409 bez utworzenia następnego runa
- [ ] #6 Testy obejmują waiting wyliczane z wielu interakcji, pytanie nieblokujące, unknown i jawne resolve do abandoned
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
