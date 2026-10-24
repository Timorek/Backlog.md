---
id: BACK-806
title: '[RAC-17] End-to-end: pełny task z pytaniem i zgodą'
status: To Do
assignee: []
created_date: '2026-10-24T08:05:00Z'
updated_date: '2026-10-24T08:06:00Z'
labels:
  - rac
  - m2-dashboard
  - e2e
  - qa
  - mvp
  - macos
dependencies:
  - BACK-800
  - BACK-801
  - BACK-804
  - BACK-805
priority: high
ordinal: 416000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Test scenariusza od Run agent przez zadane pytanie, odpowiedź z dashboardu, approval, wykonanie testów, kompletowanie i odświeżenie strony. Wykorzystaj stuba JSON-RPC i osobny test manualny z prawdziwym Codexem. Oznacz ograniczenia trybów bez interaktywnego requestUserInput.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 E2E przechodzi w mock/stub bez internetu
- [ ] #2 Manual smoke test dokumentuje przebieg na macOS
- [ ] #3 Pytanie i approval nie mieszają się ze sobą
- [ ] #4 Refresh nie gubi pending interaction
- [ ] #5 Agent ma oznaczony końcowy wynik i historię
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
