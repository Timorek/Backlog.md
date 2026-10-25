# RAC-03 — Codex App Server spike

Task: BACK-792. CLI: **0.162.1**, macOS arm64, 2026-10-24. Status: **spike wykonany — potwierdzony rzeczywistym przebiegiem w Terminalu użytkownika**. Ograniczona sesja agenta nadal blokuje start; wyniki z obu środowisk są rozdzielone. Model użyty w Terminalu: `gpt-6.1-sol`. Numer 0.162.1 pochodzi z audytu CLI na tym Macu; pierwotny raport live nie zapisywał wersji per proces, co poprawiono w skrypcie.

## Wynik i poziomy dowodu

| Sprawdzenie | Wynik | Co to potwierdza |
| --- | --- | --- |
| `codex --version`, pomoc app-server/sandbox/daemon | 0.162.1; stdio, unix, ws i daemon są w CLI | Dostępność poleceń, nie uruchomione kanały zdalne. Nie włączano daemona ani remote control. |
| Generacja JSON Schema | PASS | Kształt lokalnego protokołu; skróty plików i pola w `rac-03-schema.json`. |
| Domyślny start stdio | FAIL przed initialize | Błąd inicjalizacji SQLite w globalnym `~/.codex`, którego ta sesja nie może zapisywać. |
| Start z tymczasową bazą i logami | FAIL przed initialize | `Operation not permitted`, exit 1. Nie zmieniono globalnej konfiguracji ani katalogu CODEX_HOME. |
| Dodatkowa diagnostyka z wyłączonym code_mode_host | Ten sam EPERM | Nie ustalono dokładnego syscallu powodującego błąd. Nie przypisujemy go bez dowodu konkretnemu socketowi lub usłudze. |
| `codex sandbox`, profil `:workspace`, managed config | FAIL | `sandbox-exec: sandbox_apply: Operation not permitted`, exit 71. Polityka testu nie została empirycznie zastosowana do programu canary. |
| Prywatny listener testowy na loopback | EPERM | Ograniczenie nadrzędnej sesji; nie jest wynikiem pomiaru sieci wewnątrz sandboxa Codexa. |
| Testy transportu z kontrolowanymi procesami-fixtures | PASS | Korelacja RPC, odrzucenia, timeout, obsługa EOF i ograniczone sprzątanie procesów testowych; to nie dowody modelowe. |
| Konto/model, approval, interrupt i EOF — Terminal użytkownika | **PASS** | initialize, gpt-6.1-sol, weryfikacja efektywnej polityki thread/start, odmowa command approval, brak zapisu poza workspace, interrupted oraz exit 0 po EOF bez eskalacji. |
| Natywne `requestUserInput` — Terminal użytkownika | **NOT OBSERVED** | Nie zaobserwowano żądania po syntetycznym poleceniu. To wynik tej próby i profilu, nie dowód braku narzędzia we wszystkich trybach/modelach. |
| Fallback pytania — Terminal użytkownika | **PASS** | Dwie zakończone tury w tym samym thread: ograniczone pytanie JSON i odpowiedź z potwierdzeniem. |
| Resume ephemeral thread — Terminal użytkownika | **FAIL / nieustalona przyczyna** | thread/resume zwróciło -32600. Etykieta not_supported_for_probe_thread w pierwotnym raporcie była zbyt mocna; brak dowodu, że przyczyną jest sam tryb ephemeral. Skrypt obecnie zapisuje failed_in_probe i kod błędu. |
| Natywny sandbox — Terminal użytkownika | **PASS pomiaru, nie dowód izolacji sekretów** | Własny listener działa; syntetyczny plik poza workspace da się odczytać; połączenie do loopback kończy się errno=1. Pomiar dotyczy profilu :workspace z managed config, nie dowolnej polityki App Servera po udzieleniu nowych uprawnień. |

Próby z ograniczonej sesji: [rac-03-local.json](rac-03-local.json) i [rac-03-sandbox-local.json](rac-03-sandbox-local.json). Udane próby wykonane przez użytkownika i zweryfikowane w lokalnych artefaktach: [rac-03-terminal.json](rac-03-terminal.json), obejmujący 148 oczyszczonych wpisów, oraz [rac-03-sandbox-terminal.json](rac-03-sandbox-terminal.json). Nie przechowujemy promptów, komend, treści konta ani tokenów. `authenticationFailed: false` samo w sobie niczego nie dowodzi; wykonane tury są niezależnym potwierdzeniem działania modelu.

## Porównanie schematu z dokumentacją

Źródła: lokalne `codex app-server generate-json-schema --out <tmp>` oraz [oficjalna dokumentacja App Server](https://learn.chatgpt.com/docs/app-server). Dopiero poprawna odpowiedź serwera i rzeczywista tura są dowodem wykonania. Porównano oba warianty generacji schematu: standardowy oraz `--experimental`. Handshake próby ma experimentalApi=true, dlatego schema standardowa nie opisuje całego obserwowanego wire protocol.

| Element | Lokalny schemat 0.162.1 | Wniosek dla RAC |
| --- | --- | --- |
| `item/tool/requestUserInput` | `isBlocking` wymagane; `autoResolutionMs` opcjonalne; odpowiedzi mapowane po ID pytania | Nie każde pytanie blokuje run. W próbie modelowej nie zaobserwowano tej metody; działający fallback nie wymaga zakładania jej dostępności. |
| `availableDecisions` | Pominięte w schemacie standardowym; występuje po `generate-json-schema --experimental` i zostało zaobserwowane w rzeczywistym command approval przy experimentalApi=true | Przecięcie własnej allowlisty MVP z listą providera, gdy jest podana; przy braku pola sprawdzony kontrakt per typ. Nigdy rozszerzenie uprawnień. |
| `thread/start`, `thread/resume` | `sandbox`, `approvalPolicy`, `approvalsReviewer` w parametrach i efektywne wartości w odpowiedziach | Weryfikować wynik, nie zakładać dziedziczenia bez kontroli. |
| `turn/start` | Parametr `sandboxPolicy`; odpowiedź zawiera tylko `turn` | Nie da się udowodnić efektywnych polityk samym TurnStartResponse. |
| `turn/steer` | Wymagane `expectedTurnId`, opcjonalne `clientUserMessageId` | Korelacja z aktywną turą i deduplikacja wiadomości. |
| Ograniczanie odczytu | W lokalnym SandboxPolicy brak `readOnlyAccess`/`access`; opis web je przedstawia | Nie wysyłać nieobsługiwanych pól ani obiecywać izolacji poświadczeń przez samą allowlistę zapisu. Profile/managed config wymagają osobnej weryfikacji. |
| Server requests | Pytania, command/file/permissions approvals, MCP elicitation, tool call, auth refresh, attestation i legacy approvals | Każde żądanie musi dostać odpowiedź zgodną ze schematem albo jawny błąd; brak odpowiedzi może zawiesić pracę. |
| `serverRequest/resolved` | Metoda występuje w lokalnym schemacie | Zaobserwowano po odmowie command approval. Przerwanie z otwartym requestem nie było testowane; answered/cleared/uncertain i wiele żądań wymagają testów adaptera. |

Lokalne opcje `sqlite_home` i `log_dir` pozwalają odseparować dane próby bez kopiowania auth; zakres konfiguracji i lokalizacji opisuje [oficjalna dokumentacja zmiennych środowiskowych](https://learn.chatgpt.com/docs/config-file/environment-variables). Nie skopiowano auth.json, nie wypisano tokenów i nie zmieniono trwałych ustawień użytkownika.

## Odtwarzalny probe

Skrypt jest narzędziem badawczym w `scripts/rac/`, nie implementacją produkcyjnego adaptera, managera ani UI. Domyślnie wymaga jawnego wybrania trybu. Startuje prywatne stdio, tworzy pusty workspace i zapisuje raporty w katalogu tymczasowym poza repo. Nie dzieli katalogu roboczego z projektem ani działającym dashboardem.

W zwykłym Terminalu macOS:

```bash
cd /Users/arek/projects/dashboard_online_md/Backlog.md
export PATH="$PWD/../.rac-tools/bun-darwin-aarch64:$PWD/../.rac-tools/node-v26.12.1-darwin-arm64/bin:$PATH"
bun scripts/rac/codex-spike.ts --preflight
bun scripts/rac/codex-spike.ts --live
bun scripts/rac/codex-spike.ts --sandbox
```

- `--preflight`: initialize, modele, thread/start, kontrola efektywnych polityk i próba resume istniejącego ephemeral thread w tym samym procesie. To nie test wznowienia po crashu. Nie uruchamia tury modelu.
- `--live`: używa dostępnego, domyślnego modelu z konfiguracji konta; wykonuje krótkie syntetyczne tury: pytanie narzędziowe, fallback, odmowa zgody oraz interrupt. Wymaga działającego konta i połączenia z usługą; zużywa limit modelu. Nie wyłącza sandboxa ani nie stosuje `approvalPolicy: never`.
- `--sandbox`: bez modelu sprawdza natywny profil `:workspace` z managed config, odczyt wyłącznie syntetycznego canary poza workspace i połączenie z własnym prywatnym listenerem. Nie odczytuje plików poświadczeń. Jest pomiarem wybranego profilu CLI; zgodność z polityką rzeczywistego App Servera trzeba wykazać oddzielnie.

Probe automatycznie odpowiada tylko na jedno znane syntetyczne pytanie `rac_spike_color`, wybierając `RAC_OPTION_A`. Każde command/file approval jest odrzucane; permission request dostaje pusty zestaw uprawnień. Inne prośby dostają błąd RPC. Nie jest to polityka produkcyjnego RAC ani zgoda na operacje użytkownika. Ewentualny zapis poza workspace dotyczy wyłącznie nazwanego pliku testowego w prywatnym katalogu próby.

Raport i ograniczony ślad zapisują nazwy metod, klucze i typy zdarzeń, bez treści konta, promptów, komend, odpowiedzi i surowego stderr. Prywatne logi samego Codexa są w katalogu tymczasowym, nie w repozytorium. Nie udostępniaj ich bez przejrzenia. Ctrl+C zamyka własny proces próby; po deadline następuje ograniczona eskalacja dla własnej grupy procesów na Unix. Walidacja całego rzeczywistego drzewa potomków Codexa nadal wymaga RAC-06/10 i testów systemowych. Nie używamy zabijania procesów znalezionych po nazwie lub obcym PID.

Kod wyjścia 1 oznacza niepełny lub odrzucony przebieg; resume pozostaje osobnym wynikiem i nie jest warunkiem sukcesu tego syntetycznego testu. W nowej wersji raportu zapisujemy wersję CLI i nie utożsamiamy dowolnego błędu resume z brakiem wsparcia ephemeral. Nie wyciągaj wniosku „działa model” z samych testów fixtures ani initialize. Nawet kod 0 `--live` nie potwierdza izolacji sekretów, pytań nieblokujących i odzyskiwania po awarii; porównaj każdy wynik z checklistą taska. Brak approval w turze nie jest dowodem poprawnej obsługi approval.

## Fallback pytań i semantyka tur

Kontrakt fallbacku (dwie tury potwierdzone na gpt-6.1-sol; zapis interakcji i bramka planu należą do przyszłej implementacji):

1. Agent zapisuje plan i emituje ograniczone pytanie JSON, np. `{"kind":"question","question":"Wybrać A czy B?"}`, zgodne z `outputSchema`.
2. Provider kończy turę. RAC zapisuje blokującą interakcję lokalną typu question; nie utrzymuje fikcyjnego request ID providera. Run nadal zajmuje slot i czeka na człowieka.
3. Odpowiedź przechodzi walidację i idempotencję; RAC wywołuje `turn/start` w tym samym thread i tym samym runie. W promptcie wiąże odpowiedź z zapisanym pytaniem.
4. Dopiero odpowiedź na interakcję przeglądu planu pozwala przejść do wykonania. Tekst czatu, timeout i brak odpowiedzi nie są akceptacją.

Jeżeli działa `item/tool/requestUserInput`, należy odpowiedzieć na oryginalny request ID z zachowaniem typu, a nie uruchamiać konkurencyjną turę. `isBlocking: false` nie zatrzymuje lifecycle, choć pytanie pozostaje widoczne. Dla aktywnej tury zwykły czat używa `turn/steer` i `expectedTurnId`; `turn/start` nie jest zamiennikiem odpowiedzi na pending approval.

Probe `--live` sprawdza dwie zakończone tury fallback w tym samym thread. Nie implementuje jeszcze bazy interakcji, autoryzacji ani exactly-once delivery przez granicę procesu. Kontynuacja ephemeral thread w tym samym procesie nie dowodzi, że da się ją odzyskać po restarcie.

## Konsekwencje dla zaakceptowanego ADR

Kierunek D1/D2/D4/D7/D8 pozostaje bez zmian. Wyniki aktualizują założenia D3/D5/D6/D9:

- D5/D9: MVP może użyć potwierdzonego fallbacku w tym samym thread. Natywne pytanie strukturalne i pytanie nieblokujące nadal nie mają dowodu w tym profilu; adapter nie może zakładać ich dostępności.
- D5: dostępność availableDecisions zależy również od generacji standard/experimental i negotiated capabilities, a nie tylko numeru wersji. Poprzedni ogólny wniosek o braku pola w 0.162.1 był błędny.
- D6: potwierdzono interrupt pustej aktywnej tury i zakończenie procesu app-server po EOF. Nie potwierdzono cleanup całego drzewa potomków, przerwania z oczekującą zgodą, trwałego resume po crashu ani Windows. To wymagane testy RAC-06/10.
- D7: odczyt pliku spoza workspace jest możliwy w zbadanym profilu. Uprawnienia 0600/0700 i umieszczenie tokenu poza checkoutem nie są wystarczającym dowodem niedostępności tokenu dla procesu tego samego użytkownika. Nie czytano prawdziwych sekretów.
- D7: loopback jest zablokowany w zbadanym natywnym profilu przy ograniczonej sieci. Nie zakładamy zachowania po rozszerzeniu sieci ani zgodności wszystkich profili. Kanały CLI answer/decide pozostają zamknięte do osobnego dowodu izolacji ich poświadczeń; brak możliwości samodzielnego zatwierdzania jest warunkiem implementacji, nie osiągniętym wynikiem tego spike.
- Kanały daemon/unix/ws/remote control sprawdzono w pomocy CLI; nie uruchamiano ich. Trace zawiera remoteControl/status/changed, lecz nie zapisuje wartości statusu. Z samej nazwy zdarzenia nie wnioskujemy o włączeniu lub wyłączeniu remote control na hoście. Audyt hosta przed publikacją pozostaje bramką RAC-19.
- Task badawczy można zamknąć z powyższymi jawnie zapisanymi ograniczeniami; nie oznacza to gotowości produkcyjnego runtime, zatwierdzenia nierozstrzygniętych szczegółów recovery ani rozpoczęcia kolejnych tasków.
