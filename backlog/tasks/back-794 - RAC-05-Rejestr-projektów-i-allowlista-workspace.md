---
id: BACK-794
title: '[RAC-05] Rejestr projektów i allowlista workspace'
status: To Do
assignee: []
created_date: '2026-10-24T08:05:00Z'
updated_date: '2026-10-24T10:23:00Z'
labels:
  - rac
  - m1-local-mvp
  - backend
  - security
  - mvp
dependencies:
  - BACK-791
  - BACK-793
documentation:
  - docs/rac/decisions/0001-rac-architecture.md
priority: high
ordinal: 404000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Dodaj konfigurację katalogów repozytoriów dostępnych agentowi. W MVP obsłuż jeden projekt; bez abstrakcji wielu projektów w MVP. Ścieżek nie wolno podawać bezpośrednio z requestu WWW. Backend wybiera katalog wyłącznie z konfiguracji allowlisty. Odrzuć path traversal i linki wychodzące poza root.

Ustalenia po review ADR-0001 (2026-10-24; zaakceptowane przez użytkownika):
Q1=A: MVP ma jeden kanoniczny root powiązany z projectKey; żądania klienta nie wskazują dowolnego projectId/cwd. Dodaj kanoniczne lokalne polecenia backlog rac enable/disable; ustawienia i zgoda na włączenie są poza repo, wymagają autoryzacji lokalnego człowieka. Repo config ani PUT /api/config nie mogą włączyć RAC lub osłabić polityki. Po przeniesieniu repo powstaje nowa historia (Q7g), bez relinkowania w MVP.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Backend odczytuje jedną skonfigurowaną ścieżkę projektu
- [ ] #2 Walidacja blokuje niezgodny projectKey, nieuprawnioną sesję oraz wyjście poza skonfigurowany katalog
- [ ] #3 Backend nigdy nie używa ścieżki z payloadu żądania jako cwd
- [ ] #4 Testy obejmują nieprawidłowe i względne ścieżki
- [ ] #5 CLI enable/disable jest dostarczone przed adapterem UI; repozytorium i agent nie mogą samodzielnie włączyć RAC
- [ ] #6 Sesja, żądania i deskryptor właściciela są związane z projectKey kanonicznego root, bez wyboru dowolnej ścieżki z API
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
