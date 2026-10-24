---
id: BACK-793
title: '[RAC-04] Kontrakt stanów i testowy szkielet RAC'
status: To Do
assignee: []
created_date: '2026-10-24T08:05:00Z'
updated_date: '2026-10-24T08:06:00Z'
labels:
  - rac
  - m0-discovery
  - domain
  - tests
  - mvp
dependencies:
  - BACK-791
  - BACK-792
priority: high
ordinal: 403000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Zdefiniuj stany queued/running/waiting_for_input/waiting_for_approval/completed/failed/cancelled/unknown. Oddziel status taska Backlog.md od statusu konkretnego uruchomienia: jeden task może mieć wiele runów. Postaw testy jednostkowe kontraktów i atrapę adaptera umożliwiającą testowanie UI bez prawdziwego Codexa.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Zapisano dozwolone przejścia stanów i przypadki błędne
- [ ] #2 Testy sprawdzają idempotentne zmiany statusu i mapowanie task -> run
- [ ] #3 Mock agent umie emitować tekst pytanie approval sukces i błąd
- [ ] #4 Restart aplikacji nie jest modelowany jako sukces uruchomienia
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
