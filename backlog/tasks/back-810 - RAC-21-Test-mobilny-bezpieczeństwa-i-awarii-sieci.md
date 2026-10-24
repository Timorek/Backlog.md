---
id: BACK-810
title: '[RAC-21] Test mobilny bezpieczeństwa i awarii sieci'
status: To Do
assignee: []
created_date: '2026-10-24T08:05:00Z'
updated_date: '2026-10-24T08:06:00Z'
labels:
  - rac
  - m3-remote-access
  - qa
  - mobile
  - remote
dependencies:
  - BACK-806
  - BACK-807
  - BACK-808
  - BACK-809
priority: high
ordinal: 420000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Na telefonie z sieci komórkowej wykonaj pełny przebieg: zaloguj się, wybierz task, Run, obejrzyj logi, odpowiedz na pytanie, approve/deny, odbierz wynik. Przetestuj wygaśnięcie Access session, reconnect SSE, restart backendu, offline PC i ponowne próby. Użyj E2E Playwright dla najważniejszych UI flows oraz checklisty manualnej.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Przebieg z telefonu poza domowym Wi-Fi jest udokumentowany
- [ ] #2 Sesja po wygaśnięciu Access nie pozwala na mutacje
- [ ] #3 Po reconnect nie ma duplikacji wykonania zadania
- [ ] #4 Offline PC ma czytelny komunikat
- [ ] #5 Scenariusz negatywny odrzuca dostęp bez logowania
- [ ] #6 Test po uśpieniu/wybudzeniu Maca pokazuje prawidłowe statusy i reconnect
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
