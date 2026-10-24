---
id: BACK-815
title: '[RAC-26] Adapter wielu agentów - Claude Code opcjonalnie'
status: To Do
assignee: []
created_date: '2026-10-24T08:06:00Z'
updated_date: '2026-10-24T08:06:00Z'
labels:
  - rac
  - m4-advanced
  - multiagent
  - advanced
dependencies:
  - BACK-806
  - BACK-811
  - BACK-812
priority: low
ordinal: 425000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Wyodrębnij agent-provider interface i dodaj drugą implementację dopiero po stabilnym MVP Codex. Zweryfikuj możliwości Claude Code Remote/CLI bez zakładania zgodności protokołów. Zachowaj wspólny model Run, statusy i interakcje z provider-specific payload. UI ma wybór agenta i jego zdolności.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Codex adapter pozostaje zgodny wstecznie
- [ ] #2 Claude adapter ma osobne testy kontraktowe
- [ ] #3 Dashboard pokazuje tylko możliwości obsługiwane przez dany backend
- [ ] #4 Zmienna konfiguracji wyłącza Claude bez wpływu na Codex
- [ ] #5 Nie miesza się request IDs i uprawnień providerów
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
