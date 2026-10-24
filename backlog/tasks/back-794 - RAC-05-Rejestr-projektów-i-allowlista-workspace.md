---
id: BACK-794
title: '[RAC-05] Rejestr projektów i allowlista workspace'
status: To Do
assignee: []
created_date: '2026-10-24T08:05:00Z'
updated_date: '2026-10-24T08:06:00Z'
labels:
  - rac
  - m1-local-mvp
  - backend
  - security
  - mvp
dependencies:
  - BACK-791
  - BACK-793
priority: high
ordinal: 404000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Dodaj konfigurację katalogów repozytoriów dostępnych agentowi. W MVP obsłuż jeden projekt; przygotuj abstrakcję na kolejne. Ścieżek nie wolno podawać bezpośrednio z requestu WWW. Backend wybiera katalog wyłącznie z konfiguracji allowlisty. Odrzuć path traversal i linki wychodzące poza root.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Backend odczytuje jedną skonfigurowaną ścieżkę projektu
- [ ] #2 Walidacja blokuje nieznany projectId oraz wyjście poza katalog
- [ ] #3 Backend nigdy nie używa ścieżki z payloadu żądania jako cwd
- [ ] #4 Testy obejmują nieprawidłowe i względne ścieżki
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
