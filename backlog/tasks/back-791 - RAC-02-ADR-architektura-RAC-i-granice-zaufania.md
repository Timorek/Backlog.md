---
id: BACK-791
title: '[RAC-02] ADR: architektura RAC i granice zaufania'
status: To Do
assignee: []
created_date: '2026-10-24T08:05:00Z'
updated_date: '2026-10-24T08:06:00Z'
labels:
  - rac
  - m0-discovery
  - architecture
  - mvp
  - macos
dependencies:
  - BACK-790
priority: high
ordinal: 401000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Zaprojektuj adapter Codex, serwis sesji, API, strumień zdarzeń, persistence, interfejs Kanban i granice dostępu. Backlog CLI/API pozostaje źródłem prawdy o taskach; dane uruchomień i zdarzeń są osobno. Development i testy początkowe na macOS, a uruchomienie runnera możliwe na macOS albo Windows po wyborze hosta docelowego. MVP single-user na jednym allowlistowanym katalogu projektu i lokalnym runnerze; zdefiniuj granicę API na przyszłe oddzielenie hosta.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Powstał diagram komponentów i przepływu danych
- [ ] #2 Opisane API oraz model Run/Session/Interaction/Event
- [ ] #3 Decyzja określa gdzie przechowywać dane uruchomień i jak migrować schemat
- [ ] #4 Wskazano ryzyka prompt injection oraz skutki uruchamiania procesu na PC
- [ ] #5 Dokument opisuje co jest poza MVP
- [ ] #6 ADR rozdziela hosta developerskiego od docelowego runnera i opisuje strategię macOS/Windows
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
