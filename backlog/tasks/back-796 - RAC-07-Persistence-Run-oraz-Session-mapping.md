---
id: BACK-796
title: '[RAC-07] Persistence Run oraz Session mapping'
status: To Do
assignee: []
created_date: '2026-10-24T08:05:00Z'
updated_date: '2026-10-24T08:06:00Z'
labels:
  - rac
  - m1-local-mvp
  - persistence
  - backend
  - mvp
dependencies:
  - BACK-793
  - BACK-794
priority: high
ordinal: 406000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Zaimplementuj lokalny magazyn metadanych uruchomień i zdarzeń (np. SQLite lub sprawdzone mechanizmy repo). Dane: runId, taskId, projectId, threadId, turnId, status, timestamps, sanitized errors, pending request IDs. Backlog taski zostają w Markdown. Dodaj migracje i indeksy.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Uruchomienie mapuje się do jednego taska i jednej sesji Codex
- [ ] #2 Historia uruchomień przetrwa restart backendu
- [ ] #3 Migracje są powtarzalne i testowane
- [ ] #4 Nie zapisuje się tokenów ani sekretów w logach
- [ ] #5 Odczyt historii działa po taskId
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
