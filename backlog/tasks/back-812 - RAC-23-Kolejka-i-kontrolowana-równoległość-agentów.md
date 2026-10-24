---
id: BACK-812
title: '[RAC-23] Kolejka i kontrolowana równoległość agentów'
status: To Do
assignee: []
created_date: '2026-10-24T08:06:00Z'
updated_date: '2026-10-24T08:06:00Z'
labels:
  - rac
  - m4-advanced
  - queue
  - advanced
dependencies:
  - BACK-799
  - BACK-811
priority: medium
ordinal: 422000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Dodaj kolejkę FIFO z maxConcurrency=1 domyślnie i możliwość zwiększenia limitu przy pracy w worktree. Zachowaj idempotency key, limity CPU/RAM, powtórzenia po kontrolowanej awarii (nigdy automatycznie po nieznanym wyniku). W UI pokaż kolejkę i możliwość anulowania oczekujących pozycji.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Konfigurowalne maxConcurrency działa bez race condition
- [ ] #2 Każde zlecenie ma jednoznaczny runId
- [ ] #3 Queued run można anulować bez startu Codexa
- [ ] #4 System nie retryuje automatycznie runu w stanie unknown
- [ ] #5 Testy obciążeniowe potwierdzają limit uruchomień
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
