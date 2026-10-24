---
id: BACK-790
title: '[RAC-01] Audyt Backlog.md i przygotowanie istniejącego forka'
status: Done
assignee:
  - '@codex'
created_date: '2026-10-24T08:05:00Z'
updated_date: '2026-10-24T09:20:00Z'
labels:
  - rac
  - m0-discovery
  - discovery
  - mvp
  - macos
dependencies: []
documentation:
  - docs/rac/ARCHITECTURE.md
  - docs/rac/DEVELOPMENT.md
  - docs/rac/VALIDATION.md
priority: high
ordinal: 400000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Fork Timorek/Backlog.md już istnieje i jest sklonowany. Zweryfikuj origin/upstream i pracuj na gałęzi feature/remote-agent-control; nie twórz ponownie forka. Zidentyfikuj framework, routing web UI, backend, mechanizm przechowywania tasków, testy i system konfiguracji. Rozwój i testy wykonuj na macOS; nie zakładaj, że docelowy runner musi działać na tym samym hoście. NIE zmieniaj zachowania istniejącego Kanbana. Zapisz mapę modułów, punktów rozszerzeń i aktualne komendy uruchamiania na Macu.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Fork uruchamia obecny dashboard lokalnie na macOS (Apple Silicon lub Intel, zgodnie z posiadanym Maciem)
- [x] #2 Repozytorium ma przechodzące testy bazowe lub udokumentowane istniejące błędy
- [x] #3 Dokument audytu wskazuje konkretne pliki rozszerzeń dla API i UI
- [x] #4 Opisany jest sposób aktualizowania forka z upstream
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 bun run check:types passes when TypeScript touched
- [x] #2 bun run check . passes when formatting/linting touched
- [x] #3 bun test (or scoped test) passes
<!-- DOD:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Cel RAC-01: audyt i przygotowanie już istniejącego Timorek/Backlog.md, bez zmiany zachowania Kanbana i bez implementacji RAC-02–28. Plan bazuje na kodzie 1.55.3 (6f988de0), a nie na hipotetycznej osobnej aplikacji.

1. Potwierdzić instrukcje MANIFESTO.md, AGENTS.md i CLI instructions; odczytać task i zależności. RAC-01 nie ma zależności. Pracować na feature/remote-agent-control; zachować origin i upstream, bez reset/push i bez backlog init. Przypisać @codex, ustawić In Progress.
2. Utrwalić mapę architektury w docs/rac/ARCHITECTURE.md: src/cli.ts (canonical CLI i browser), src/core/backlog.ts (task lifecycle), src/core/task-detail.ts i src/utils/readiness.ts (zależności/readiness), src/file-system/operations.ts i src/markdown/ (semantyczne zapisy), src/core/content-store.ts i task-watcher (odświeżanie).
3. Zweryfikować istniejące UI/API: src/server/index.ts / BacklogServer.start (Bun routes, 127.0.0.1), src/web/index.html i App.tsx (React routing i WebSocket), src/web/lib/api.ts (task GET/PUT), TaskCard.tsx / TaskDetailsModal.tsx (przyszłe akcje i sesja), DependencyGraphSection.tsx / DependencyInput.tsx (relacje). Nie dodawać jeszcze przycisków ani endpointów RAC.
4. Zainstalować Bun 1.4.4 i Node >=26.12.1, zachować lockfile; zapisać wersję codex. Uruchomić test bazowy, types, Biome i build, odróżnić błędy środowiska od regresji. Zapis wyników: docs/rac/VALIDATION.md. Nie naprawiać niepowiązanych usterek.
5. Zweryfikować importer z ZIP względem src/cli.ts --help: rzeczywiste ID z alokatora, wersjonowany JSON/paginacja, brak duplikatów, plany zachowane na jawne życzenie użytkownika, pełna suma zależności przy --dep. Zweryfikować 28 tasków z roadmap.json i idempotencję importu. Zmienić opis tworzenia forka na weryfikację istniejącego.
6. Uruchomić dashboard przez bun run cli browser --no-open --port 6421 z katalogu forka. Potwierdzić 28 RAC, otworzyć BACK-790/BACK-791, sprawdzić zależności, wykonać odwracalną zmianę opisu i statusu BACK-790 oraz sprawdzić zapis przez CLI. Nie zmieniać innych tasków do testów. W tej sesji bind TCP jest blokowany EPERM, więc ten krok wymaga Terminala z możliwością otwarcia portu; nie deklarować go jako wykonanego.
7. Sprawdzić development: NODE_ENV=development bun --watch src/cli.ts browser --no-open --port 6421; potwierdzić frontend refresh i restart backendu. Sam development flag nie jest dowodem HMR. Instrukcja i manual checklist: docs/rac/DEVELOPMENT.md.
8. Opisać aktualizację forka z czystej gałęzi: git fetch upstream --no-tags, przegląd zmian, git merge upstream/main, weryfikacja typów/lintu/testów/UI. Nie usuwać kolidujących tagów macOS ani lokalnych zmian. Architektura proponowana: src/rac jako moduł wewnątrz istniejącego Bun backendu, wspólna semantyka CLI/API, lokalny adapter Codex stdio i odrębne dane operacyjne. Decyzje persistence/transport/auth kierować do RAC-02; rzeczywisty spike Codexa do RAC-03.
9. Zaktualizować AGENTS.md bez naruszania istniejących sekcji. Sprawdzić git diff/status i przygotować lokalny commit tylko dla konfiguracji, importowanych tasków i docs/rac. Bez push.
10. Zaznaczyć tylko kryteria udowodnione wynikami. Pozostawić RAC-01 In Progress do czasu rzeczywistego uruchomienia dashboardu i weryfikacji UI. Przedstawić plan do przeglądu; nie rozpoczynać RAC-02 ani kolejnych tasków automatycznie.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Setup 2026-10-24: zaimportowano 28 tasków RAC (BACK-790–817), zweryfikowano pola i zależności przez source CLI; ponowny import nie tworzy duplikatów. Bun 1.4.4 / Node 26.12.1 lokalnie obok repo; Codex 0.162.1. Build/types/Biome przechodzą; 471 testów UI/dependencies przechodzi. Pełny bun run test nie przechodzi w ograniczonym środowisku: porty EPERM, watcher TUI timeout i testy native Node uruchamiane pod Bun. Dashboard oraz HMR nadal wymagają ręcznej weryfikacji w Terminalu. Architektura w docs/rac jest propozycją do RAC-02. Nie uruchomiono implementacji kolejnych tasków.

Weryfikacja AC: #2 potwierdzone raportem testów z jawnymi niepowodzeniami; #3 mapą plików w docs/rac/ARCHITECTURE.md; #4 procedurą fetch --no-tags / merge upstream/main. AC #1 pozostaje niespełnione: uruchomienie dashboardu i interakcje blokuje EPERM. Nie oznaczać Done przed weryfikacją UI.

Potwierdzenie użytkownika po ręcznej weryfikacji: dashboard forka działa na http://127.0.0.1:6421/board (6420 jest zajęty przez inny projekt). Użytkownik potwierdził checklistę: 28 tasków RAC, szczegóły BACK-790, zależność BACK-791 od BACK-790 oraz odwracalne edycje opisu i statusu. Tym samym wcześniejsza blokada AC #1 została rozwiązana przez test poza ograniczoną sesją agenta. HMR/reconnect i widok mobilny nie były potwierdzone; pozostają nieweryfikowane.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Przygotowano istniejący fork do RAC: 28 tasków z zależnościami i planami, stałe instrukcje AGENTS.md, dokumentacja architektury i developmentu oraz szczegółowy plan RAC-01. Build/types/Biome poprawne; 471 testów UI/dependencies przechodzi, niepowodzenia pełnego zestawu zapisane w VALIDATION.md. Użytkownik potwierdził działanie źródłowego dashboardu na 6421 i sprawdzenie listy tasków, zależności oraz edycji. Wszystkie 4 AC spełnione. HMR pozostaje nieweryfikowane. Kolejny task RAC-02 nie został rozpoczęty.
<!-- SECTION:FINAL_SUMMARY:END -->
