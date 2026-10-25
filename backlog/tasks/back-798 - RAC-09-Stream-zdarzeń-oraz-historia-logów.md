---
id: BACK-798
title: '[RAC-09] Stream zdarzeń oraz historia logów'
status: To Do
assignee: []
created_date: '2026-10-24T08:05:00Z'
updated_date: '2026-10-24T10:23:00Z'
labels:
  - rac
  - m1-local-mvp
  - events
  - api
  - mvp
dependencies:
  - BACK-795
  - BACK-796
  - BACK-797
documentation:
  - docs/rac/decisions/0001-rac-architecture.md
priority: high
ordinal: 408000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Dodaj SSE do strumieniowania znormalizowanych zdarzeń: agent message, command progress, tool activity, errors, turn completion. Trwałe zapisywanie historii oraz paginacja. Stosuj filtr danych wrażliwych, limity objętości, kontrolę dostępu i numery sekwencyjne do odtwarzania po reconnect.

Ustalenia po review ADR-0001 (2026-10-24; zaakceptowane przez użytkownika):
WebSocket istniejącej tablicy emituje wyłącznie invalidation rac-updated; UI pobiera GET /api/rac/runs/latest. SSE/historia ma sequence i deduplikację. Q7c: retencja usuwa całe terminalne runy, bez luk i history_reset w zachowanym runie. Limit logów runa daje jeden event truncated z rezerwą na control/terminal events; expired run zwraca 410 przed otwarciem SSE. Replay nie gubi eventów zapisanych podczas przejścia na live.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Działa strumień z monotonicznym event ID
- [ ] #2 Po odświeżeniu UI widać historię bez utraty porządku
- [ ] #3 Po utracie połączenia klient nadrabia brakujące zdarzenia
- [ ] #4 W payloadach nie ujawnia się sekretów środowiska
- [ ] #5 Duży log nie zawiesza dashboardu
- [ ] #6 WebSocket rac-updated odświeża odznaki bez przenoszenia treści logów; runs/latest zwraca stan ostatnich runów
- [ ] #7 Retencja, truncated i replay nie tworzą luk numeracji ani nie usuwają aktywnego/unknown runa
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
