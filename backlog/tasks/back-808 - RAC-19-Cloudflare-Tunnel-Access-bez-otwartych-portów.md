---
id: BACK-808
title: '[RAC-19] Cloudflare Tunnel + Access bez otwartych portów'
status: To Do
assignee: []
created_date: '2026-10-24T08:05:00Z'
updated_date: '2026-10-24T10:22:00Z'
labels:
  - rac
  - m3-remote-access
  - cloudflare
  - remote
  - macos
dependencies:
  - BACK-807
documentation:
  - docs/rac/decisions/0001-rac-architecture.md
priority: high
ordinal: 418000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Uruchom Cloudflare Tunnel (cloudflared) na wybranym hoście usługowym, początkowo macOS, obok Backlog web UI. Wystaw jedynie frontend/backend HTTP przez Cloudflare Access z tożsamością single-user i MFA, bez app-server ani plików repo. Sprawdź, że aplikacja nasłuchuje wyłącznie na 127.0.0.1; tunnel inicjuje połączenie wychodzące. Zapisz instrukcję DNS, secret management, recovery i warunki darmowego planu. Gdy backend i runner są na osobnych komputerach, nie udostępniaj między nimi niezabezpieczonego kanału w internecie.

Ustalenia po review ADR-0001 (2026-10-24; zaakceptowane przez użytkownika):
Oceń dodatkowe kanały Codexa: app-server daemon, remote control i ws listener; na hoście RAC są wyłączone albo osobno zabezpieczone i objęte audytem. Nie wystawiaj developerskiego NODE_ENV=development ani raw RPC. Ruch tunelu traktuj jako zdalny nawet gdy przychodzi z loopback.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Panel dostępny poza LAN po zalogowaniu
- [ ] #2 Brak przekierowanych portów na routerze
- [ ] #3 App-server i kanał kontroli agenta nie są publicznie routowane
- [ ] #4 Nieautoryzowane wejście zatrzymuje Cloudflare Access
- [ ] #5 Udokumentowano zależność od domeny i limitów planu
- [ ] #6 Udokumentowano stan kanałów zdalnych Codexa i brak publicznego obejścia uwierzytelnienia RAC
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
