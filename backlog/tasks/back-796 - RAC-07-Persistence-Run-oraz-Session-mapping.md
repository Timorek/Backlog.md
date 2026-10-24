---
id: BACK-796
title: '[RAC-07] Persistence Run oraz Session mapping'
status: To Do
assignee: []
created_date: '2026-10-24T08:05:00Z'
updated_date: '2026-10-24T10:23:00Z'
labels:
  - rac
  - m1-local-mvp
  - persistence
  - backend
  - mvp
dependencies:
  - BACK-793
  - BACK-794
documentation:
  - docs/rac/decisions/0001-rac-architecture.md
priority: high
ordinal: 406000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Zaimplementuj lokalny magazyn metadanych uruchomień i zdarzeń w Bun SQLite poza repo. Dane: runId, taskId, projectKey, threadId, turnId, status, timestamps, sanitized errors, pending request IDs. Backlog taski zostają w Markdown. Dodaj migracje i indeksy.

Ustalenia po review ADR-0001 (2026-10-24; zaakceptowane przez użytkownika):
Q7: jedna tabela idempotencji dla wszystkich mutacji; wiadomości jako eventy bez osobnej encji Message; migracje przez PRAGMA user_version w transakcji; retencja całymi runami terminalnymi, event truncated przy limicie logów runa. Katalog danych i lock poza Git. projectKey z realpath, przeniesienie repo tworzy nową historię. Run zapisuje taskCreatedAt i SHA-256 surowej treści taska jako taskRevision. Ownership z fencingiem: rekomendacja SQLite EXCLUSIVE wymaga faktycznego uzyskania blokady transakcją przed deskryptorem, nie samej PRAGMA; drugi serwer bez RAC. unknown i otwarte interakcje chronione przed retencją.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Uruchomienie mapuje się do jednego taska i jednej sesji Codex
- [ ] #2 Historia uruchomień przetrwa restart backendu
- [ ] #3 Migracje są powtarzalne i testowane
- [ ] #4 Nie zapisuje się tokenów ani sekretów w logach
- [ ] #5 Odczyt historii działa po taskId
- [ ] #6 Migracje są atomowe z user_version; nieznana nowsza wersja blokuje RAC bez uszkodzenia zwykłego Backloga
- [ ] #7 Jeden właściciel projektu utrzymuje wyłączną blokadę; utrata ownership odgradza starty i zapisy
- [ ] #8 Historia, idempotencja i retencja odpowiadają Q7 bez osobnej tabeli wiadomości lub kasowania środkowych eventów
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
