---
id: BACK-805
title: '[RAC-16] UI i API: aprobaty operacji Codexa'
status: To Do
assignee: []
created_date: '2026-10-24T08:05:00Z'
updated_date: '2026-10-24T10:53:00Z'
labels:
  - rac
  - m2-dashboard
  - security
  - frontend
  - interaction
  - mvp
dependencies:
  - BACK-802
  - BACK-803
  - BACK-804
documentation:
  - docs/rac/decisions/0001-rac-architecture.md
priority: high
ordinal: 415000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Obsłuż requestApproval dla komend, zmian plików i uprawnień w oparciu o schema app-server. Wyświetl polecenie, cwd, zakres zmian i powód. Zapewnij Approve once / Reject / Cancel, bez automatycznego blanket approve. Zmiana dozwolonych uprawnień musi być jawna i ograniczona.

Ustalenia po review ADR-0001 (2026-10-24; zaakceptowane przez użytkownika):
Q1/Q4/Q7: CLI decide razem z API tylko przy poświadczeniach niedostępnych agentowi; on-request i approvalsReviewer=user. Idempotencja wspólnym nagłówkiem, generację weryfikuje serwer. Schemat standardowy Codex 0.162.1 pomija availableDecisions, lecz wariant experimental i rzeczywisty runtime je zawierają: stosuj własną allowlistę MVP per typ żądania zawężaną przez listę providera, gdy ją poda, jednorazowe accept/decline/cancel dla obsługiwanych command/file requests. Nie pokazuj opcji session/policy amendment/grantRoot ani przyznania dodatkowych permissions. Nie rozpoznawaj zgód z treści czatu. Pozostałe typy requestów mają jawnie testowaną odmowę zgodną ze schematem, nie fikcyjny uniwersalny accept.

Wynik spike RAC-03: rzeczywisty command approval zawieral availableDecisions; pole potwierdzono rowniez przez generate-json-schema --experimental. Nie traktuj braku pola w standardowej generacji jako braku wsparcia w wersji CLI.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Użytkownik widzi co zatwierdza zanim kliknie Approve
- [ ] #2 Reject odsyła poprawną decyzję do app-server
- [ ] #3 UI udostepnia decyzje z wlasnej allowlisty MVP per typ, zawezone przez availableDecisions jesli runtime je zwraca; brak pola nie pozwala poszerzac uprawnien
- [ ] #4 Po wygaśnięciu requestu przyciski są nieaktywne
- [ ] #5 Domyślna polityka nie pomija zgód
- [ ] #6 CLI i API decide odrzucają stare/już rozwiązane interakcje i nie pozwalają agentowi zatwierdzić własnej operacji
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
