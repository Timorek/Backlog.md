---
id: BACK-816
title: '[RAC-27] Hardening: security and reliability test suite'
status: To Do
assignee: []
created_date: '2026-10-24T08:06:00Z'
updated_date: '2026-10-24T10:22:00Z'
labels:
  - rac
  - m5-release
  - qa
  - security
  - release
  - macos
dependencies:
  - BACK-810
  - BACK-811
  - BACK-812
  - BACK-813
documentation:
  - docs/rac/decisions/0001-rac-architecture.md
priority: high
ordinal: 426000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Wykonaj przegląd bezpieczeństwa aplikacji i tunelu: auth bypass, CSRF, malicious task text, prompt injection, command injection, path traversal, process leaks, resource abuse, logs, secrets, stale approvals. Testy jednostkowe, integracyjne i E2E. Przejdź checklistę sandbox / workspace-write / approval policies Codexa na macOS. Potwierdź zachowanie podczas sleep/wake i sprawdź ograniczenia uprawnień użytkownika.

Ustalenia po review ADR-0001 (2026-10-24; zaakceptowane przez użytkownika):
Dodaj negatywne testy: próba odpowiedzi/zgody z sandboxa agenta; obcy Host/Origin oraz Content-Type text/plain na istniejących trasach; cookies dwóch lokalnych projektów na różnych portach; podwójny właściciel i utrata blokady po sleep; nieobsługiwany server request; słabsze efektywne polityki Codexa; brak luki replay i brak starych approvals po restarcie.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Przechodzą testy unit/integration/Playwright w CI
- [ ] #2 Negatywne testy blokują shell injection i traversal
- [ ] #3 Niezatwierdzone operacje nie są autoryzowane automatycznie
- [ ] #4 W logach testowych nie ma tokenów ani haseł
- [ ] #5 Dokument zawiera znane ryzyka i sposób ich ograniczania
- [ ] #6 Nieautoryzowany sandbox, obca strona i drugi projekt nie mogą rozstrzygać zgód ani uruchamiać poleceń
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
