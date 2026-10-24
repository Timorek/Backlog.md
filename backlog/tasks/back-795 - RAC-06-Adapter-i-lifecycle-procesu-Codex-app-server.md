---
id: BACK-795
title: '[RAC-06] Adapter i lifecycle procesu Codex app-server'
status: To Do
assignee: []
created_date: '2026-10-24T08:05:00Z'
updated_date: '2026-10-24T08:06:00Z'
labels:
  - rac
  - m1-local-mvp
  - backend
  - codex
  - mvp
  - macos
dependencies:
  - BACK-792
  - BACK-793
  - BACK-794
priority: high
ordinal: 405000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Zaimplementuj adapter ze wsparciem startThread, startTurn, steerOrContinue, interrupt, respondToRequest, subscribe. Na macOS uruchamiaj codex app-server jako child process w Node.js (spawn z tablicą argumentów, bez shell:true). Zaimplementuj handshake, timeouty, obsługę stdout/stderr, restart, sprzątanie procesu oraz rozwiązywanie ścieżki do Codex CLI bez polegania na interaktywnym PATH. Kod adaptera powinien pozostać wieloplatformowy; nie publikuj app-server w internecie.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Adapter uruchamia app-server i kończy proces po shutdown
- [ ] #2 JSON-RPC requests i responses korelują po id
- [ ] #3 Rozłączenie i crash procesu są wykrywane
- [ ] #4 stdout zdarzeń nie jest traktowane jako polecenia shella
- [ ] #5 Testy adaptera używają mock transport
- [ ] #6 Spawn i zamykanie procesu testowane na macOS; ścieżka binarki działa przy uruchomieniu z launchd
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
