---
id: BACK-803
title: '[RAC-14] API: odpowiedzi na pytania i kontynuacja sesji'
status: To Do
assignee: []
created_date: '2026-10-24T08:05:00Z'
updated_date: '2026-10-24T10:22:00Z'
labels:
  - rac
  - m2-dashboard
  - backend
  - interaction
  - mvp
dependencies:
  - BACK-802
documentation:
  - docs/rac/decisions/0001-rac-architecture.md
priority: high
ordinal: 413000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Dodaj POST /api/rac/interactions/{id}/answer. Zweryfikuj uprawnienia użytkownika i przynależność do runu; odpowiedz na trwający request właściwą metodą JSON-RPC albo uruchom następną turę w tym samym threadId dla fallbacku. Wprowadź idempotencję oraz obsługę timeoutu i request resolved.

Ustalenia po review ADR-0001 (2026-10-24; zaakceptowane przez użytkownika):
Q1=A: CLI answer razem z API, pod warunkiem potwierdzonej w RAC-03 izolacji poświadczeń od agenta. Q7a/b: jeden Idempotency-Key i wspólna tabela; bez responseId i expectedOwnerGeneration w body, serwer sam sprawdza zapisaną generację. Stare interakcje są stale i nie trafiają do providera. Dopuszczenie wykonania po planie wymaga prawidłowej odpowiedzi na konkretną interakcję, nie dowolnego tekstu czatu.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Odpowiedź dociera do właściwego wątku Codexa
- [ ] #2 Agent może kontynuować bez tworzenia nowego taska
- [ ] #3 Dwie równoczesne odpowiedzi nie rozwiązują requestu dwukrotnie
- [ ] #4 Odpowiedź na wygasłe pytanie zwraca czytelny konflikt
- [ ] #5 Pytania i odpowiedzi zapisują historię z datą
- [ ] #6 API i CLI answer współdzielą deduplikację; request poprzedniej generacji jest odrzucany bez wysłania do providera
- [ ] #7 Agent nie uzyskuje poświadczeń do odpowiedzi/zgód; przy braku udowodnionej izolacji kanał CLI nie jest udostępniony
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
