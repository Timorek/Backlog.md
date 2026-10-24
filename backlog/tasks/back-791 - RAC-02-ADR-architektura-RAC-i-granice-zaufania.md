---
id: BACK-791
title: '[RAC-02] ADR: architektura RAC i granice zaufania'
status: Done
assignee:
  - '@codex'
  - '@claude'
created_date: '2026-10-24T08:05:00Z'
updated_date: '2026-10-24T10:26:00Z'
labels:
  - rac
  - m0-discovery
  - architecture
  - mvp
  - macos
dependencies:
  - BACK-790
documentation:
  - docs/rac/decisions/0001-rac-architecture.md
  - docs/rac/ARCHITECTURE.md
modified_files:
  - docs/rac/decisions/0001-rac-architecture.md
  - docs/rac/ARCHITECTURE.md
  - docs/rac/DEVELOPMENT.md
priority: high
ordinal: 401000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Zaprojektuj adapter Codex, serwis sesji, API, strumień zdarzeń, persistence, interfejs Kanban i granice dostępu. Backlog CLI/API pozostaje źródłem prawdy o taskach; dane uruchomień i zdarzeń są osobno. Development i testy początkowe na macOS, a uruchomienie runnera możliwe na macOS albo Windows po wyborze hosta docelowego. MVP single-user na jednym allowlistowanym katalogu projektu i lokalnym runnerze; zdefiniuj granicę API na przyszłe oddzielenie hosta.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Powstał diagram komponentów i przepływu danych
- [x] #2 Opisane API oraz model Run/Session/Interaction/Event
- [x] #3 Decyzja określa gdzie przechowywać dane uruchomień i jak migrować schemat
- [x] #4 Wskazano ryzyka prompt injection oraz skutki uruchamiania procesu na PC
- [x] #5 Dokument opisuje co jest poza MVP
- [x] #6 ADR rozdziela hosta developerskiego od docelowego runnera i opisuje strategię macOS/Windows
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 bun run check:types passes when TypeScript touched
- [x] #2 bun run check . passes when formatting/linting touched
- [x] #3 bun test (or scoped test) passes
<!-- DOD:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Potwierdzić BACK-790=Done i gotowość BACK-791; przypisać @codex i In Progress. Zakres: dokumentacja ADR, bez implementacji runtime RAC i bez rozpoczynania następnych tasków.
2. Zweryfikować aktualne punkty integracji: src/cli.ts, src/server/index.ts (routing/start/stop), src/core/backlog.ts i task-detail.ts (task/readiness), src/web/App.tsx, lib/api.ts, TaskCard.tsx i TaskDetailsModal.tsx. Przeczytać wcześniejszą propozycję i źródłową paczkę.
3. Opracować docs/rac/decisions/0001-rac-architecture.md jako Proposed do przeglądu: jeden właściciel procesów dla CLI/API, moduł wewnątrz Backlog.md, model Run/Session/Interaction/Event, kontrakty HTTP i zdarzeń, SQLite poza repo + migracje/backup/odzyskiwanie.
4. Wyznaczyć granice zaufania, allowlistę jednego workspace, restrykcyjny sandbox i operacje approvals; opisać prompt injection i skutki uprawnień procesu na komputerze użytkownika. Auth lokalne od pierwszego execution endpointu, gate zdalnego dostępu RAC-18/19 i pełne zabezpieczenie wszystkich istniejących tras.
5. Określić zakres single-user/single-project/local-runner MVP, odroczenia worktree/kolejki/innych providerów, granicę przyszłego zdalnego runnera oraz osobne wymagania macOS/Windows. Protokół Codexa potwierdzić dokumentacją; rzeczywisty model/spike i zgodność wersji pozostawić RAC-03.
6. Uaktualnić ARCHITECTURE.md jako mapę istniejącego kodu z odnośnikiem do ADR, usunąć rozbieżne propozycje; zachować oryginalne materiały paczki.
7. Sprawdzić linki/lokalne ścieżki, zgodność sześciu AC, git diff --check, dostępny lint oraz dobrane istniejące testy readiness/dependencies. Nie tworzyć testów kopiujących prozę ani nie uruchamiać testów modelowych w zadaniu dokumentacyjnym.
8. Zastosowac review ADR i odpowiedzi uzytkownika: Q1-Q5=A, Q6=A (akceptacja etapowa), Q7=a-g. Zachowac poprawki recenzenta, ujednolicic dokumenty i przez CLI zsynchronizowac wymagania 20 przyszlych taskow bez zmiany ich ID/statusow/zaleznosci. Nie implementowac ich ani nie tworzyc nowych taskow.
9. Zweryfikowac schemat lokalnego Codexa i faktyczne uzyskanie blokady SQLite. Porownac przyszle taski z zapisem sprzed zmian, sprawdzic linki/Mermaid, typy/lint i testy zaleznosci. Po zapisaniu etapowej akceptacji zamknac BACK-791; D3/D5/D6/D9 pozostaja wstepne do RAC-03. Nie rozpoczynac RAC-03 automatycznie.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Przygotowano kompletny ADR-0001 (Proposed) i odchudzono ARCHITECTURE.md do mapy istniejącego kodu + odnośnika do jednego dokumentu decyzji. AC1: diagram D1; AC2: model D3 i API D4/protokół D5; AC3: ścieżki danych/migracje/backup D2 i recovery D6; AC4: zagrożenia i granice zaufania D7; AC5: jawny zakres MVP/odroczeń; AC6: development vs host i strategia macOS/Windows D8. Rekomendacje: jeden właściciel procesów współdzielony przez CLI/API, SQLite poza Git, HTTP+SSE, lokalna ochrona wykonania przed RAC-18/19. Kontrole: 13 plików integracji i linki poprawne; Mermaid.parse w JSDOM PASS; Biome 474 pliki PASS; types 551 plików PASS; dependency/dependency-graph 48 testów, 0 fail, 142 assertions. Groma agent-instructions próbowano: narzędzie nadal nieobecne; nie zmieniano plików Groma. Nie zmieniono runtime aplikacji i nie rozpoczęto RAC-03. Oczekuje przeglądu użytkownika przed zatwierdzeniem materialnych decyzji zgodnie z task-execution (punkt 7 Planning Workflow); status In Progress pozostaje do akceptacji.

Rewizja ADR-0001 po review (2026-10-24, @claude). Zastosowano ustalenia review bez zmian kodu aplikacji i bez zmian innych tasków.
- ADR: nowe sekcje D9 (agent jako użytkownik Backloga), Otwarte decyzje Q1–Q7 (bez odpowiedzi), Wpływ na taski (do wykonania przez CLI po akceptacji), Historia zmian; tabela faktów protokołu Codexa 0.162.1 ze schematu wygenerowanego lokalnie (isBlocking, approvalsReviewer, brak availableDecisions, dodatkowe żądania serwera, daemon/ws/remote control); diagram z granicami zaufania.
- D7: ochrona Host/Origin/Content-Type wszystkich tras od RAC-08 (obecny serwer nie ma tych kontroli), ciasteczka a porty, poświadczenia decyzji nieosiągalne z sandboxa, jawne approvalsReviewer/approvalPolicy/sandbox z weryfikacją efektywnych wartości, osobny listener tunelu, kanały zdalne Codexa.
- D1–D6: fencing blokady właściciela (rekomendacja SQLite EXCLUSIVE), jedno zachowanie drugiej instancji browser, lokalne włączanie RAC poza repo, resolve dla unknown i stan abandoned, statusy interakcji (cleared/uncertain/stale), semantyka run/tura, wygaśnięcie przez turn/interrupt, taskCreatedAt i taskRevision (SHA-256 treści), format błędu zgodny z ApiError, rac-updated i GET /api/rac/runs/latest.
- ARCHITECTURE.md: przywrócono procedurę aktualizacji z upstream (dowód AC#4 RAC-01, wcześniej usunięty w tym tasku) i zasady zgodności z upstream; tabela zsynchronizowana z ADR. DEVELOPMENT.md: odnośnik bezpieczeństwa wskazuje ADR D7.
Weryfikacja: mermaid.parse (mermaid 12.2.0 + jsdom) OK; linki względne i bloki kodu OK; cytowane linie kodu zgodne; git diff --check czysty; bun run check: 474 pliki, bez poprawek; bun test dependency + dependency-graph: 48 pass, 0 fail. groma agent-instructions: narzędzie nadal niedostępne. Task pozostaje In Progress do odpowiedzi na Q6 i przeglądu użytkownika.

Zastosowano review i decyzje uzytkownika: Q6=A (akceptacja etapowa), Q1-Q5=A, Q7=wszystkie uproszczenia a-g. ADR ma status Accepted etapowo: kierunek D1/D2/D4/D7/D8 przyjety, D3/D5/D6/D9 wstepne do RAC-03. Zachowano prace @claude, procedure upstream i link DEVELOPMENT.md. Lokalny schemat 0.162.1 potwierdza isBlocking i brak availableDecisions; doprecyzowano sandboxPolicy dla turn/start oraz fakt, ze TurnStartResponse nie zwraca polityk. Mini-eksperyment SQLite potwierdzil, ze PRAGMA EXCLUSIVE sama nie ustanawia ownership; po transakcji zapisu blokada trwa do zamkniecia polaczenia. Nie uruchamiano modelu ani runtime RAC. Przez CLI zaktualizowano wymagania 20 przyszlych taskow; liczba nadal 28. Porownanie JSON potwierdzilo zachowanie ID/statusow/assignees/zaleznosci/priorytetow oraz pierwotnych AC poza jawnymi poprawkami; pozostalych 6 przyszlych taskow nie zmieniono. Biome: 474 pliki PASS; types: 551 plikow PASS; dependency/dependency-graph: 48 testow PASS, 142 asercje; linki, Mermaid w JSDOM i git diff --check PASS. Etapowa akceptacja usuwa powod oczekiwania w In Progress. Wszystkie 6 AC potwierdzone; RAC-03 pozostaje To Do.
<!-- SECTION:NOTES:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: @claude
created: 2026-10-24T10:08:00Z

---

Otwarte decyzje do odpowiedzi użytkownika — szczegóły i rekomendacje w ADR-0001, sekcja „Otwarte decyzje”:
- Q1 Zakres CLI dla RAC (konflikt z manifestem) — przed RAC-05 i RAC-08
- Q2 Przegląd planu przed wykonaniem — przed RAC-08 i RAC-13
- Q3 Status i assignee przy starcie runa — przed RAC-08
- Q4 Kto kończy task i domyślna polityka zgód — przed RAC-08 i RAC-16
- Q5 Kolejka czy 409 w MVP — przed RAC-04
- Q6 Tryb akceptacji ADR — przed zamknięciem BACK-791 i startem RAC-03
- Q7 Uproszczenia mechanizmów — przed RAC-04, RAC-07 i RAC-14

---

author: @codex
created: 2026-10-24T10:26:00Z

---

Odpowiedzi uzytkownika: Q1=A (CLI razem z API), Q2=A (plan, akceptacja, wykonanie), Q3=A (status/assignee zmienia agent przez CLI), Q4=A (on-request, konwencja braku Done i audyt), Q5=A (409, bez kolejki), Q6=A (akceptacja etapowa), Q7=wszystkie uproszczenia a-g. Zastosowano do ADR i wymagan 20 przyszlych taskow. Pytania Q1-Q7 rozstrzygniete; szczegoly D3/D5/D6/D9 weryfikuje RAC-03.

---
<!-- COMMENTS:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Poprawiono ADR-0001 zgodnie z review, zapisano etapowa akceptacje uzytkownika i odpowiedzi Q1-Q7. Uzgodniono wspolny backend/CLI, SQLite poza repo, HTTP/SSE, ochrone lokalna/zdalna i uproszczenia MVP. Zsynchronizowano 20 przyszlych taskow przez CLI, bez zmiany liczby/zaleznosci/statusow; zachowano poprawki recenzenta. Biome/types i 48 testow przechodza, diagram i linki poprawne. Nie wdrozono runtime ani nie rozpoczeto RAC-03. D3/D5/D6/D9 celowo wstepne do spike RAC-03.
<!-- SECTION:FINAL_SUMMARY:END -->
