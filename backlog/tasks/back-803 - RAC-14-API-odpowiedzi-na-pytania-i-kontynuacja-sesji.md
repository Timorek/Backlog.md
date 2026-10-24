---
id: BACK-803
title: '[RAC-14] API: odpowiedzi na pytania i kontynuacja sesji'
status: To Do
assignee: []
created_date: '2026-10-24T08:05:00Z'
updated_date: '2026-10-24T08:06:00Z'
labels:
  - rac
  - m2-dashboard
  - backend
  - interaction
  - mvp
dependencies:
  - BACK-802
priority: high
ordinal: 413000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Dodaj POST /api/rac/interactions/{id}/answer. Zweryfikuj uprawnienia użytkownika i przynależność do runu; odpowiedz na trwający request właściwą metodą JSON-RPC albo uruchom następną turę w tym samym threadId dla fallbacku. Wprowadź idempotencję oraz obsługę timeoutu i request resolved.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Odpowiedź dociera do właściwego wątku Codexa
- [ ] #2 Agent może kontynuować bez tworzenia nowego taska
- [ ] #3 Dwie równoczesne odpowiedzi nie rozwiązują requestu dwukrotnie
- [ ] #4 Odpowiedź na wygasłe pytanie zwraca czytelny konflikt
- [ ] #5 Pytania i odpowiedzi zapisują historię z datą
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
