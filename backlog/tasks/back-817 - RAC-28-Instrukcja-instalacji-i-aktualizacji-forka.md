---
id: BACK-817
title: '[RAC-28] Instrukcja instalacji i aktualizacji forka'
status: To Do
assignee: []
created_date: '2026-10-24T08:06:00Z'
updated_date: '2026-10-24T08:06:00Z'
labels:
  - rac
  - m5-release
  - docs
  - release
  - macos
dependencies:
  - BACK-809
  - BACK-810
  - BACK-813
  - BACK-816
priority: medium
ordinal: 427000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Przygotuj dokumentację krok po kroku dla macOS: instalacja Node/Bun, git fork, build, codex auth, Backlog config, lokalne repo projektu, tunnel, Access, launchd, bezpieczeństwo, backup danych runów, troubleshooting, update upstream i rollback. Wyraźnie rozdziel development na Macu od uruchomienia runnera na wybranym hoście i dodaj sekcję deployment Windows jako wariant przyszły. Dodaj tutorial telefon -> start task -> pytanie -> odpowiedź -> review.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Nowa instalacja działa według README bez domysłów
- [ ] #2 Opisano zależności i koszty domeny oraz ewentualne limity usług
- [ ] #3 Wskazano jak odzyskać dane po awarii dysku lub procesu
- [ ] #4 Udokumentowano aktualizację forka z upstream i rollback
- [ ] #5 Opisano ograniczenia MVP i kolejne kroki
- [ ] #6 Instrukcja uruchomienia na Macu zawiera launchd oraz politykę sleep/wake
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
