---
id: BACK-809
title: '[RAC-20] macOS launchd: autostart, wake policy i healthchecks'
status: To Do
assignee: []
created_date: '2026-10-24T08:05:00Z'
updated_date: '2026-10-24T10:22:00Z'
labels:
  - rac
  - m3-remote-access
  - macos
  - ops
  - remote
dependencies:
  - BACK-799
  - BACK-807
  - BACK-808
documentation:
  - docs/rac/decisions/0001-rac-architecture.md
priority: medium
ordinal: 419000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Skonfiguruj dla wybranego Maca uruchamianie backendu i cloudflared przez launchd (LaunchAgent użytkownika), logowanie stdout/stderr, backoff, health endpointy oraz status online/offline. Runner powinien działać bez uprawnień root. Uwzględnij różnicę między uruchomieniem po zalogowaniu a działaniem przed zalogowaniem, sleep/lid-close, App Nap, PATH w launchd, uprawnienia do katalogów i przerwy w dostępie do internetu. Jeżeli docelowy agent zostanie na Windows, wykonaj analogiczny adapter Task Scheduler jako osobny follow-up zamiast udawać, że launchd obsługuje Windows.

Ustalenia po review ADR-0001 (2026-10-24; zaakceptowane przez użytkownika):
Restart przez launchd, podobnie jak bun --watch, przenosi niepewny aktywny run do unknown. Healthcheck ujawnia recovery wymagające człowieka; nie wykonuje automatycznie resume/resolve. Nie obiecuj wykonywania zadań podczas uśpienia Maca.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Po zalogowaniu użytkownika macOS usługi uruchamiają się bez ręcznego terminala
- [ ] #2 Opisano ograniczenie LaunchAgent: nie gwarantuje pracy przed logowaniem użytkownika
- [ ] #3 Agent runner działa bez root/admin i bez interaktywnego terminala
- [ ] #4 Stan offline/online i logi są dostępne po restarcie oraz po utracie internetu
- [ ] #5 Dokumentacja określa zasady macOS sleep, zamkniętej klapy i stałej dostępności hosta
- [ ] #6 Konfiguracja PATH, kodów powrotu i restartów launchd jest przetestowana
- [ ] #7 Restart usługi nie raportuje fałszywego running/sukcesu i nie odtwarza starych zgód
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
