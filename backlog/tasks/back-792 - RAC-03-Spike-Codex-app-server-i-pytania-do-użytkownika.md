---
id: BACK-792
title: '[RAC-03] Spike: Codex app-server i pytania do użytkownika'
status: Done
assignee:
  - '@codex'
created_date: '2026-10-24T08:05:00Z'
updated_date: '2026-10-24T10:55:00Z'
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
documentation:
  - docs/rac/decisions/0001-rac-architecture.md
  - docs/rac/spikes/RAC-03-CODEX-APP-SERVER.md
modified_files:
  - scripts/rac/codex-spike.ts
  - scripts/rac/codex-spike.test.ts
  - docs/rac/spikes/RAC-03-CODEX-APP-SERVER.md
  - docs/rac/spikes/rac-03-schema.json
  - docs/rac/spikes/rac-03-local.json
  - docs/rac/spikes/rac-03-sandbox-local.json
  - docs/rac/spikes/rac-03-terminal.json
  - docs/rac/spikes/rac-03-sandbox-terminal.json
  - docs/rac/decisions/0001-rac-architecture.md
  - docs/rac/DEVELOPMENT.md
priority: high
ordinal: 402000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Na macOS sprawdź rzeczywistą wersję Codex CLI i JSON-RPC app-server. Zademonstruj initialize, thread/start, turn/start, event streaming, turn/interrupt, approval i tool/requestUserInput (o ile dostępne). Rozróżnij deklarowany protokół od faktycznej dostępności pytań w używanym trybie/modelu Codexa. Jeśli aktywny tryb nie emituje requestUserInput, zaprojektuj fallback: ustrukturyzowane pytanie + koniec tury + następna tura z odpowiedzią. Uruchamiaj lokalnie przez stdio bez publicznego listenera.

Ustalenia po review ADR-0001 (2026-10-24; zaakceptowane przez użytkownika):
Po review ADR-0001 i akceptacji etapowej Q6: zweryfikuj schemat przypiętego Codexa 0.162.1, isBlocking oraz roznice dostepnosci availableDecisions w schemacie standard/experimental i runtime. Sprawdź efektywne approvalsReviewer=user, approvalPolicy=on-request, sandbox w thread/start/resume oraz sandboxPolicy w turn/start (jego odpowiedź nie zwraca polityk). Zweryfikuj read/sieć sandboxa względem katalogu danych RAC, sekretów decyzji i loopback; kanały daemon/remote control/ws, reakcję na EOF stdin, zakończenie potomków i serverRequest/resolved po przerwaniu. Oddziel fakty ze schematu od działania konta/modelu; nie implementuj runtime RAC. Wyniki D3/D5/D6/D9 wpisz do ADR; materialna zmiana zatwierdzonego kierunku wraca do użytkownika.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Działa testowe uruchomienie app-server na macOS
- [x] #2 Powstał zapisany przykładowy przebieg thread/turn/event
- [x] #3 Sprawdzono zachowanie requestUserInput i approval na używanym koncie i modelu
- [x] #4 Udokumentowano fallback dla pytań tekstowych oraz ograniczenia aktywnej tury
- [x] #5 Nie użyto trybu bypass approvals ani pełnego dostępu jako domyślnego
- [x] #6 Zapisano porownanie schematu standardowego i experimental z dokumentacja oraz runtime, isBlocking, metod server requests i dostepnosci availableDecisions w 0.162.1
- [x] #7 Udokumentowano zasięg odczytu/sieci sandboxa i warunek niedostępności poświadczeń rozstrzygania zgód dla agenta, bez przyznawania pełnych uprawnień
- [x] #8 Zweryfikowano jawne polityki thread/turn, EOF/przerwanie i kanały zdalne; niepotwierdzone zachowania są jawnie odnotowane zamiast uznawane za działające
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 bun run check:types passes when TypeScript touched
- [x] #2 bun run check . passes when formatting/linting touched
- [x] #3 bun test (or scoped test) passes
<!-- DOD:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Potwierdzic gotowosc BACK-792 oraz Done BACK-790/BACK-791; przypisac @codex i In Progress. Zachowac niezacommitowane zmiany poprzednich taskow i review. Zakres to izolowany spike, bez Agent Managera i bez nastepnych taskow.
2. Wygenerowac swiezy schemat Codex 0.162.1 do tmp, porownac metody/parametry z oficjalna dokumentacja. Uruchomic jedynie lokalne stdio z jawnym sandbox/approvalPolicy on-request i approvalsReviewer user; nie wlaczac daemona ani remote control, nie uzywac bypass/full-access.
3. Przygotowac odtwarzalny skrypt probe w scripts/rac i izolowany workspace w tmp. Nie podawac modelowi prawdziwych sekretow; uzyc syntetycznych canary do badan odczytu. Zapisac tylko oczyszczony slad protokolu i wyniki bez poświadczen konta.
4. Sprawdzic initialize/initialized, account availability bez ujawniania danych konta, model/list, thread/start/resume, turn/start, strumien zdarzen, interrupt i EOF. Zatrzymywac wlasne procesy po ograniczonym deadline. Oddzielic schemat/mock od prawdziwego serwera/modelu.
5. Jesli konto i srodowisko pozwola: zademonstrowac pytanie blokujace/nieblokujace, odpowiedz na ten sam request, odmowe approval i serverRequest/resolved po przerwaniu; sprawdzic zasięg sandboxa do syntetycznego pliku poza workspace i loopback bez otwierania publicznego listenera. Brak sieci lub uprawnien zapisac jako ograniczenie, nie jako wynik modelowy.
6. Przetestowac fallback pytania: ustrukturyzowany output i koniec tury, odpowiedz w nastepnej turze tego samego thread/run. Bez pozornego utrzymywania aktywnego RPC; polityki weryfikowac na podstawie rzeczywistych odpowiedzi thread, nie TurnStartResponse.
7. Dodac znaczące testy skryptu dla korelacji RPC, timeoutow/EOF i bezpiecznej odmowy. Uruchomic odpowiedni zestaw testow, typy i Biome; zweryfikowac git diff.
8. Zapisac wyniki i slad w docs/rac/spikes/, uaktualnic wstepne D3/D5/D6/D9 ADR dowodami (bez zmiany przyjetego kierunku). Zaznaczyc w BACK-792 tylko udowodnione AC. Jezeli rzeczywisty test konta/modelu jest zablokowany, pozostawic In Progress z odtwarzalna komenda i konkretnym powodem. Nie rozpoczynac RAC-04 automatycznie.

9. Uwzglednic rzeczywiste wyniki Terminala i sprawdzic artefakty. Poprawic wniosek standard/experimental availableDecisions i etykiete resume bez przypisywania nieustalonej przyczyny. Udokumentowac model, fallback, refusal, interrupt, EOF oraz canary/loopback z ograniczeniami; po kontrolach zamknac task bez rozpoczynania RAC-04.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
RAC-03: wykonano lokalna czesc spike bez produkcyjnego runtime RAC. Dodano scripts/rac/codex-spike.ts (--preflight/--live/--sandbox) i 12 testow transportu/bezpiecznej odmowy. Dodano raport docs/rac/spikes/RAC-03-CODEX-APP-SERVER.md, skroty i pola lokalnego schematu rac-03-schema.json oraz oczyszczone rac-03-local.json/rac-03-sandbox-local.json. Zaktualizowano ADR i DEVELOPMENT.md linkiem do dowodow, zachowujac etapowa akceptacje. Rzeczywisty start z globalnym state konczy sie bledem inicjalizacji SQLite; sqlite_home/log_dir w tmp usuwaja ten blad, ale proces nadal zwraca EPERM przed initialize (exit 1). Dodatkowa proba z wylaczonym code_mode_host ma ten sam wynik; nie ustalono dokladnego syscallu. Natywny codex sandbox -P :workspace --include-managed-config konczy sie sandbox_apply EPERM (exit 71), a lokalny listener testowy rowniez EPERM. Nie uzyskano zadnej odpowiedzi initialize, modelu, thread/turn/event ani pomiaru izolacji. Nie czytano prawdziwych sekretow, nie kopiowano auth i nie uzyto pelnego dostepu/never ani publicznego listenera. Lokalny schemat 0.162.1 potwierdza wymagane isBlocking, brak availableDecisions i readOnlyAccess/access w SandboxPolicy, sandboxPolicy w turn/start oraz tylko turn w jego odpowiedzi. Fixtures nie sa dowodem modelowym. Kontrole: 12 testow PASS, 29 asercji; types 553 pliki PASS; Biome 479 plikow PASS; linki/bloki i git diff --check PASS. AC4 (dokumentacja fallbacku), AC5 (bez bypass) i AC6 (porownanie schematu) potwierdzone. AC1/2/3/7/8 pozostaja niespelnione lub niezweryfikowane i task In Progress. Uzytkownik otrzymal komendy do zwyklego Terminala; po uwadze, ze nie moze kopiowac z pytania, przekazano je w zwyklym bloku kodu. Oczekujemy wynikow --live i --sandbox. RAC-04 nie rozpoczeto.

Otrzymano wyniki rzeczywistych prob z Terminala uzytkownika i odczytano ich lokalne artefakty (nie tylko wklejony tekst): report.json i 148 oczyszczonych wpisow trace z rac03-probe-QV1qON oraz raport natywnego sandboxa rac03-sandbox-Avh2Ec. initialize/modelExecution/effectivePolicyVerified poprawne; gpt-6.1-sol; 4 tury completed i 1 interrupted; command approval zostalo odrzucone, potem serverRequest/resolved; outsideFileCreated=false; EOF exit 0 bez eskalacji. Native requestUserInput nie zaobserwowano w tej probie, bez wniosku o niedostepnosci we wszystkich trybach. Fallback: dwie zakonczone tury w tym samym thread, pytanie JSON + potwierdzona odpowiedz. Resume zwrocilo -32600: nie ustalono przyczyny, nie dowiedziono braku wsparcia ephemeral; poprawiono zbyt mocna etykiete raportu i dodano zapis wersji CLI do kolejnych prob. Natywny profil :workspace z managed config: canary poza workspace odczytane, wlasny listener dziala, polaczenie loopback odrzucone errno=1. To nie dowod niedostepnosci prawdziwego sekretu RAC ani zachowania po poszerzeniu sieci; kanal answer/decide pozostaje bramkowany oddzielnym dowodem izolacji. Nie odczytywano prawdziwych sekretow. Korekta istotnego wniosku: availableDecisions jest w schemacie --experimental i w rzeczywistym requestApproval, a nie w standardowej generacji. Poprawiono ADR, raport, helper odmowy i wymagania BACK-805 oraz AC6 BACK-792 tak, aby odzwierciedlaly wynik standard/experimental/runtime, bez zmiany zakresu taska. Wszystkie 8 AC spelnione w zakresie spike z jawnymi ograniczeniami. Niewykazane przypadki: pytania nieblokujace, pending-request przy interrupt, caly proces tree, persistent resume po crashu, izolacja wlasciwych credentials, stan remote-control hosta i Windows. Sa to nadal bramki implementacji odpowiednich taskow, nie deklarowane sukcesy. Kontrole po poprawkach: 13 testow probe PASS, 31 asercji; types 553 pliki PASS; Biome 481 plikow PASS; asercje artefaktow i linki PASS; git diff --check PASS. Zapisano oddzielnie nieudane proby ograniczonej sesji i udane proby Terminala. RAC-04 nie rozpoczeto.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
RAC-03 zakonczony rzeczywistym przebiegiem gpt-6.1-sol w Terminalu uzytkownika. Potwierdzono stdio initialize, restrykcyjna polityke thread/start, odmowe command approval, fallback pytania w dwoch turach, interrupt oraz EOF. Zachowano 148 oczyszczonych wpisow trace i pomiar natywnego sandboxa: odczyt canary poza workspace mozliwy, loopback zablokowany. Native requestUserInput nie zaobserwowano; resume zwrocilo -32600, przyczyna nieustalona. Skorygowano availableDecisions: pole jest experimental i obecne w runtime; zawezono odmowe allowlista i zsynchronizowano ADR/RAC-16. 13 testow, types i Biome przechodza. Izolacja prawdziwych credentials i edge cases recovery pozostaja jawnie nieweryfikowane i wymagane przed odpowiednimi funkcjami runtime. Nie wdrozono Agent Managera ani nie rozpoczeto kolejnego taska.
<!-- SECTION:FINAL_SUMMARY:END -->
