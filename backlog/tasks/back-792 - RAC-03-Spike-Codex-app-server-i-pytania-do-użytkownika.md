---
id: BACK-792
title: '[RAC-03] Spike: Codex app-server i pytania do użytkownika'
status: To Do
assignee: []
created_date: '2026-10-24T08:05:00Z'
updated_date: '2026-10-24T08:06:00Z'
labels:
  - rac
  - m0-discovery
  - codex
  - spike
  - mvp
  - macos
dependencies:
  - BACK-790
  - BACK-791
priority: high
ordinal: 402000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Na macOS sprawdź rzeczywistą wersję Codex CLI i JSON-RPC app-server. Zademonstruj initialize, thread/start, turn/start, event streaming, turn/interrupt, approval i tool/requestUserInput (o ile dostępne). Rozróżnij deklarowany protokół od faktycznej dostępności pytań w używanym trybie/modelu Codexa. Jeśli aktywny tryb nie emituje requestUserInput, zaprojektuj fallback: ustrukturyzowane pytanie + koniec tury + następna tura z odpowiedzią. Uruchamiaj lokalnie przez stdio bez publicznego listenera.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Działa testowe uruchomienie app-server na macOS
- [ ] #2 Powstał zapisany przykładowy przebieg thread/turn/event
- [ ] #3 Sprawdzono zachowanie requestUserInput i approval na używanym koncie i modelu
- [ ] #4 Udokumentowano fallback dla pytań tekstowych oraz ograniczenia aktywnej tury
- [ ] #5 Nie użyto trybu bypass approvals ani pełnego dostępu jako domyślnego
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 bun run check:types passes when TypeScript touched
- [ ] #2 bun run check . passes when formatting/linting touched
- [ ] #3 bun test (or scoped test) passes
<!-- DOD:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Przeczytaj AGENTS.md i aktualne instrukcje Backlog.md.
2. Zweryfikuj kod forka i aktualną wersję Codexa na macOS.
3. Zapisz wyniki/spike/ADR bez implementowania kolejnych tasków.
4. Przedstaw ustalenia i plan do zaakceptowania.
<!-- SECTION:PLAN:END -->
