---
id: BACK-793
title: '[RAC-04] Kontrakt stanów i testowy szkielet RAC'
status: Done
assignee:
  - '@codex'
created_date: '2026-10-24T08:05:00Z'
updated_date: '2026-10-24T12:33:00Z'
labels:
  - rac
  - m0-discovery
  - domain
  - tests
  - mvp
dependencies:
  - BACK-791
  - BACK-792
documentation:
  - docs/rac/decisions/0001-rac-architecture.md
  - docs/rac/RUN-STATE.md
modified_files:
  - src/rac/types.ts
  - src/rac/run-state.ts
  - src/rac/testing/mock-agent.ts
  - src/test/rac-run-state.test.ts
  - src/test/rac-mock-agent.test.ts
  - docs/rac/RUN-STATE.md
  - docs/rac/ARCHITECTURE.md
  - docs/rac/decisions/0001-rac-architecture.md
priority: high
ordinal: 403000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Zdefiniuj stany starting/running/interrupting/interrupted/completed/failed/unknown/abandoned; oczekiwanie wyliczane z interakcji. Oddziel status taska Backlog.md od statusu konkretnego uruchomienia: jeden task może mieć wiele runów. Postaw testy jednostkowe kontraktów i atrapę adaptera umożliwiającą testowanie UI bez prawdziwego Codexa.

Ustalenia po review ADR-0001 (2026-10-24; zaakceptowane przez użytkownika):
Q5=A i Q7f: przechowuj lifecycle starting/running/interrupting/interrupted/completed/failed/unknown/abandoned. Oczekiwanie na input/approval wyliczaj ze zbioru otwartych interakcji blokujących; pytania nieblokujące nie zatrzymują runa. unknown zajmuje slot, dopóki człowiek nie rozstrzygnie go do abandoned. Brak queued i kolejki w MVP; drugi start daje 409 run_active. Uzgodnij stany z wynikami RAC-03.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Zapisano dozwolone przejścia stanów i przypadki błędne
- [x] #2 Testy sprawdzają idempotentne zmiany statusu i mapowanie task -> run
- [x] #3 Mock agent umie emitować tekst pytanie approval sukces i błąd
- [x] #4 Restart aplikacji nie jest modelowany jako sukces uruchomienia
- [x] #5 Brak queued w MVP; zajęty slot zwraca 409 bez utworzenia następnego runa
- [x] #6 Testy obejmują waiting wyliczane z wielu interakcji, pytanie nieblokujące, unknown i jawne resolve do abandoned
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 bun run check:types passes when TypeScript touched
- [x] #2 bun run check . passes when formatting/linting touched
- [x] #3 bun test (or scoped test) passes
<!-- DOD:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Potwierdzic Done BACK-791/BACK-792, gotowosc BACK-793, zapisac In Progress i @codex. Zakres: czysty kontrakt wewnetrzny src/rac, testy i deterministyczny mock; bez endpointow, UI, process spawnu i persystencji.
2. Dodac src/rac/types.ts: osiem uzgodnionych stanow, readonly tozsamosc runa (project/taskCreatedAt/taskRevision/session/owner), minimalne interakcje oraz znormalizowane zdarzenia mocka. Status taska pozostaje w istniejacym modelu Backloga.
3. Test-first w src/test/rac-run-state.test.ts: idempotencja, poprawne i niedozwolone przejscia, terminalne stany, unknown jako zajety slot, jawne potwierdzone resolve do abandoned, restart aktywnego runa do unknown. Oczekiwanie wyliczane z wielu open+blocking interakcji dla wlasciwego runa i generacji; nieblokujace pytania nie zatrzymuja pracy. Nie konczyc runa z blokujaca interakcja.
4. Zaimplementowac minimalne czyste funkcje w src/rac/run-state.ts: przejscia, recovery/resolve, waiting, przyjecie do pojedynczego slotu z konfliktem 409 run_active (bez mutacji listy i bez queued) oraz historie task -> wiele runow z istniejaca kanonizacja task ID i rozroznieniem createdAt/projektu. Brak DB lub mechanizmu blokad; atomowa persystencja nalezy do RAC-07/08.
5. Dodac src/rac/testing/mock-agent.ts i src/test/rac-mock-agent.test.ts: synchroniczne kontrolowane emitowanie tekstu, pytania, approval, sukcesu i bledu, stale runId/ownerGeneration oraz unsubscribe. Mock nie wykonuje polecen i nie udaje dowodu dzialania Codexa.
6. Zapisac docs/rac/RUN-STATE.md z tabela przejsc, zachowaniem waiting/unknown i ograniczeniami kontraktu. Dodac linki w mapie architektury i ADR; nie zmieniac zaakceptowanego kierunku.
7. Przejsc przez uproszczenie dzialajacego kodu i osobny pass dokumentacji zgodnie z rpi:document-code; nie dublowac w komentarzach regul udowodnionych testami. Uruchomic scoped testy RAC i istniejace zaleznosci/ID, typecheck, Biome oraz build, poniewaz dodajemy modul TypeScript.
8. Zweryfikowac szesc AC i DoD, zapisac wyniki w tasku, zakonczyc Done i utworzyc lokalny commit tylko tego zadania zgodnie z ustalonym workflow. Nie rozpoczynac RAC-05 ani nie pushowac automatycznie.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
RAC-04: dodano src/rac/types.ts, run-state.ts i testing/mock-agent.ts jako wewnetrzny kontrakt, bez endpointow, UI, spawnu, DB i kolejki. Osiem uzgodnionych lifecycle; tabela przejsc w docs/rac/RUN-STATE.md i kodzie, 64 pary sprawdzone testami. Idempotencja statusow zachowuje obiekt przy powtorzeniu. Completion odrzuca open/uncertain blocking interaction odpowiedniego runa/generacji. Waiting wyliczany niezaleznie input/approval tylko dla otwartych blokujacych interakcji running; nieblokujace, obce i stale nie daja akcji. Restart aktywnego runa daje unknown, ktory nadal zajmuje slot; resolve jest osobna operacja wymagajaca potwierdzenia zatrzymania, wynik abandoned; autoryzacja i dowod procesu naleza do przyszlego callera. Przy zajetym slocie RunStateError.status=409, code=run_active, bez zmiany listy; faktyczna atomowa rezerwacja/HTTP naleza do RAC-07/08. Historia taska uzywa istniejacego canonicalTaskId oraz projectKey i taskCreatedAt; rewizje i sesje moga sie roznic, status taska nie zmienia sie wraz z runem. Mock synchronicznie emituje tekst/question/approval/completed/error ze stalym runId/generacja i unsubscribe, bez Codexa. Po przegladzie uproszczen zachowano czyste funkcje i minimalne typy; pass rpi:document-code dodal tylko dwa komentarze granic callera (autoryzacja i atomowosc). Kontrole: 85 nowych testow PASS; dobrany zestaw regresji 229 pass, 0 fail, 622 assertions/8 plikow; types 558 plikow PASS; Biome 486 plikow PASS; bun run build PASS; Bun.build target browser dla run-state/mock PASS; linki i git diff --check PASS. Groma sprobowano: brak narzedzia, zadnych plikow Groma nie edytowano. Poczatkowy status taska byl opozniony wzgledem analizy; po uwadze uzytkownika zapisano In Progress i @codex przed implementacja. Wszystkie 6 AC spelnione w zakresie kontraktu i testowego szkieletu; nie deklarujemy gotowosci runtime. RAC-05 nie rozpoczeto.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Dodano wewnetrzne kontrakty RAC: lifecycle, derived waiting, odzyskiwanie do unknown, jawne resolve, pojedynczy slot i historie wielu runow na task. Deterministyczny mock emituje zdarzenia do testow przyszlego UI bez uruchamiania agenta. Statusy/assignee zwyklych taskow i istniejacy Kanban pozostaja oparte na obecnym modelu. 229 testow regresji (w tym 85 nowych), types, Biome, build CLI i browser bundle przechodza. Autoryzacja, atomowy zapis, provider lifecycle i endpointy pozostaja zakresem kolejnych taskow. Dokumentacja i task zawieraja dowody; nastepnego zadania nie rozpoczeto.
<!-- SECTION:FINAL_SUMMARY:END -->
