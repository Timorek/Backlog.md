---
id: BACK-814
title: '[RAC-25] Powiadomienia Telegram o pytaniach i wynikach'
status: To Do
assignee: []
created_date: '2026-10-24T08:06:00Z'
updated_date: '2026-10-24T10:22:00Z'
labels:
  - rac
  - m4-advanced
  - notifications
  - advanced
dependencies:
  - BACK-802
  - BACK-807
  - BACK-810
documentation:
  - docs/rac/decisions/0001-rac-architecture.md
priority: low
ordinal: 424000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Dodaj opcjonalny notifier Telegram ze zdarzeniami waiting_for_input, approval, completed, failed, offline. Powiadomienie zawiera tytuł taska, status i deep link do dashboardu; żadnych sekretów, tokenów, pełnych promptów lub komend. Token bota przechowuj poza repo, obsłuż throttling i brak dostępu do Telegrama.

Ustalenia po review ADR-0001 (2026-10-24; zaakceptowane przez użytkownika):
Powiadomienie niesie minimalne metadane i link; odpowiedź na powiadomienie nie rozstrzyga approval/plan review bez równoważnego uwierzytelnienia i korelacji do właściwego requestu.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Powiadomienie przychodzi dla wybranych zdarzeń
- [ ] #2 Nie wycieka token bota ani kod projektu
- [ ] #3 Link prowadzi do właściwego runu po zalogowaniu
- [ ] #4 Wyłączenie integracji nie blokuje agenta
- [ ] #5 Błędy API Telegram są logowane i retryowane z limitem
- [ ] #6 Odpowiedź na powiadomienie nie stanowi nieautoryzowanego kanału zatwierdzania
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
