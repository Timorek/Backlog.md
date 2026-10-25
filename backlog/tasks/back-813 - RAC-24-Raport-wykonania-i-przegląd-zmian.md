---
id: BACK-813
title: '[RAC-24] Raport wykonania i przegląd zmian'
status: To Do
assignee: []
created_date: '2026-10-24T08:06:00Z'
updated_date: '2026-10-24T10:23:00Z'
labels:
  - rac
  - m4-advanced
  - git
  - review
  - advanced
dependencies:
  - BACK-806
  - BACK-811
documentation:
  - docs/rac/decisions/0001-rac-architecture.md
priority: medium
ordinal: 423000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Po każdej turze dodaj podsumowanie plików zmienionych, status testów, listę commitów/diffów i opis pozostałych ryzyk. Raport nie oznacza taska Done automatycznie; użytkownik zatwierdza rezultat. Zabezpiecz rendering diffów i limity wielkości. Po review możliwe przekazanie do ręcznego merge/PR.

Ustalenia po review ADR-0001 (2026-10-24; zaakceptowane przez użytkownika):
Q4=A: raport nie ustawia automatycznie terminalnego statusu taska. Agent otrzymuje regułę przygotowania raportu i oczekiwania na decyzję człowieka; MVP nie udaje twardej blokady zapisu przy on-request. Raport wyróżnia każdą zmianę statusu taska i plików sterujących agentem (AGENTS.md, .codex, .claude, backlog) w trakcie runa.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Z runu można przejść do diffu i test report
- [ ] #2 Status testów odróżnia passed/failed/not-run
- [ ] #3 RAC nie ustawia Done automatycznie; agent ma regułę oczekiwania na decyzję użytkownika, a każda zmiana statusu trafia do audytu (konwencja MVP, bez deklaracji twardej blokady zapisu)
- [ ] #4 Przegląd zmian jest bezpiecznie renderowany
- [ ] #5 Zmiany agenta nie nadpisują niezatwierdzonych zmian
- [ ] #6 Raport ujawnia zmiany statusu taska i plików sterujących agentem oraz ograniczenia konwencji promptu
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
