# RAC — kontrakt stanów i mock agenta

RAC-04 / BACK-793. Wewnętrzny kontrakt Backlog.md, zgodny z ADR-0001 Q5 i Q7f oraz wynikami RAC-03. Kod: [typy](../../src/rac/types.ts), [przejścia i slot](../../src/rac/run-state.ts), [mock](../../src/rac/testing/mock-agent.ts). Nie jest publicznym SDK.

Moduł nie uruchamia Codexa i nie dodaje endpointów, przycisków, bazy, kolejki ani blokad międzyprocesowych. CLI i API przyjmą te same semantyki w odpowiednich taskach. Status taska i jego assignee nadal należą do obecnego modelu Backloga; ukończenie runa nie oznacza Done taska.

## Lifecycle

Przechowywane statusy: `starting`, `running`, `interrupting`, `interrupted`, `completed`, `failed`, `unknown`, `abandoned`. `queued` oraz `waiting_for_input` / `waiting_for_approval` nie są statusami runa.

| Z | Dozwolone nowe statusy |
| --- | --- |
| starting | running, interrupting, interrupted, failed, unknown |
| running | interrupting, interrupted, completed, failed, unknown |
| interrupting | interrupted, completed, failed, unknown |
| interrupted | brak |
| completed | brak |
| failed | brak |
| unknown | tylko jawne resolve do abandoned, osobną operacją |
| abandoned | brak |

Powtórzenie tego samego statusu w `transitionRun` jest idempotentne i zwraca ten sam obiekt. Każda rzeczywista zmiana zwraca nowy rekord, zachowując jego tożsamość. Nieznane statusy i niedozwolone przejścia dają `RunStateError` z kodem oraz `status: 409`.

`interrupted` wymaga potwierdzenia zatrzymania przez adapter/właściciela. Może wystąpić także przed `running`, jeżeli zatrzymanie zostało potwierdzone w trakcie startu. Sam request przerwania daje `interrupting`. `interrupting → completed` obsługuje wyścig: tura może zakończyć się naturalnie przed skutecznym przerwaniem. Funkcja przejścia sprawdza kontrakt, nie weryfikuje procesu ani pochodzenia zdarzenia — to odpowiedzialność adaptera i managera.

`completed` jest odrzucane, gdy istnieje należąca do tego runa i generacji blokująca interakcja `open` lub `uncertain`. Dzięki temu koniec tury z pytaniem fallback nie kończy runa: run pozostaje `running` z wyliczonym oczekiwaniem, a odpowiedź rozpocznie następną turę w tej samej sesji. Caller musi przekazać kompletny aktualny zbiór interakcji; nie ma domyślnego pustego argumentu, który pomijałby tę kontrolę. Powtórzenie już zapisanego statusu pozostaje no-op.

`failed` oznacza potwierdzony błąd wykonania, a nie domyślne rozpoznanie utraty łączności. Utrata pewności o procesie daje `unknown`; inaczej awaria połączenia mogłaby fałszywie zwolnić slot.

## Oczekiwanie wynika z interakcji

`getRunWaitingFor` zwraca `{ input, approval }` niezależnie dla obu rodzajów oczekiwania. Dwa blokujące pytania nie nadpisują się; rozwiązanie jednego nie ukrywa pozostałych. Pytanie i approval mogą jednocześnie dać `{ input: true, approval: true }` — nie ustalamy sztucznego priorytetu, UI może pokazać oba.

Do aktywnego widoku oczekiwania liczą się tylko interakcje z właściwym `runId` i `ownerGeneration`, mające `blocking: true`, `status: open`, kiedy lifecycle to `running`. Pytanie nieblokujące nie zatrzymuje pracy, choć jego treść nadal może być widoczna na liście interakcji. Rodzaj `question` daje input; rodzaje approval i zachowawczo MCP elicitation dają approval. Obsługa lub odmowa MCP jest osobną polityką adaptera; ta funkcja niczego nie zatwierdza.

Stany `answered`, `cleared`, `expired`, `stale` oraz interakcje obcego runa/generacji nie tworzą aktywnego oczekiwania. `uncertain` nie oferuje ponownej odpowiedzi, ale nadal blokuje `completed`, jeśli interakcja była blokująca. W `starting`, `interrupting`, `unknown` i stanach terminalnych nie wyświetlamy akcji odpowiadania/zgód jako aktywnego oczekiwania. Nie jest to zamiennik autoryzacji ani walidacji odpowiedzi w backendzie.

Taski RAC-13/14/16 dostarczą trwałe przejścia interakcji i sprawdzanie zakresu odpowiedzi. Kontrakt RAC-04 nie odlicza timeoutów i nie zmienia sam `open` na `expired`; caller przekazuje aktualny stan.

## Restart, resolve i slot

`recoverRun` zachowuje rekordy terminalne, a każde nieterminalne wykonanie zamienia na `unknown`. Ponowne recovery jest idempotentne. Nie wznawia pracy, nie udaje sukcesu i nie zmienia tożsamości starego właściciela. Interakcje poprzedniego procesu wymagają oznaczenia `stale` w docelowym magazynie; sam kontrakt runa nie zapisuje interakcji. Wyliczony widok nie udostępnia dla `unknown` aktywnych odpowiedzi.

`resolveUnknownRun(run, previousProcessStopped)` działa tylko przy jawnym `true`, zmienia wyłącznie `unknown → abandoned` i jest idempotentne dla już `abandoned`. Zwykłe `transitionRun` nie pozwala obejść resolve. Flaga nie jest dowodem ani uprawnieniem użytkownika: przyszły caller musi wcześniej uwierzytelnić i autoryzować człowieka oraz przedstawić mu wiarygodne dane o poprzednim procesie. Helper nie sprawdza PID, nie zabija procesu i nie może być bezpośrednio udostępniony jako niezabezpieczona akcja sieciowa.

Terminalne: `interrupted`, `completed`, `failed`, `abandoned`. Wszystkie pozostałe zajmują slot, w szczególności `unknown` oraz run oczekujący na odpowiedź w stanie `running`.

`admitRun` przyjmuje wyłącznie nowy rekord `starting`. Przy istniejącym nieterminalnym runie tego projektu zwraca błąd `run_active` z kontraktowym statusem 409, bez dodania kandydata do listy. Powtórzone ID w projekcie daje `run_exists`. Po zakończonym/przerwanym runie nowa próba ma nowe ID, może wskazywać tę samą sesję i nie zmienia historii starej próby. Dane innego projektu nie zajmują slotu tego projektu; funkcja nie tworzy przy tym rejestru wielu projektów.

To czysta funkcja listy, nie atomowa rezerwacja w bazie ani działający HTTP 409. Właściciel musi wykonać odczyt, kontrolę i zapis pod właściwą transakcją/blokadą. Współbieżność między klientami, idempotencja żądań i fencing pozostają zakresem RAC-07/08. Kontrakt nie umożliwia pomijania aktualnej kontroli taska, jego zależności, rewizji ani uprawnień.

## Powiązanie task → wiele runów

`AgentRun` przechowuje kontekst projektu, taska, sesji, rewizji i właściciela. `findTaskRuns` wybiera runy według `projectKey`, `taskId` oraz `taskCreatedAt`; zachowuje kolejność przekazanej historii. Rewizja i sesja mogą się różnić między próbami.

Kanonizacja ID korzysta z istniejącego `canonicalTaskId`, więc pełne `BACK-793` i `back-0793` oznaczają to samo. To nie resolver dowolnego wejścia użytkownika: caller najpierw rozwiązuje jednoznaczny task przez Core, także z właściwym prefiksem i regułami archiwum/branchy. Nie zgadujemy tożsamości na podstawie samego numeru.

`taskCreatedAt` pochodzi z tego samego kanonicznego odczytu Core i musi mieć ten sam zapis we wszystkich próbach. Rozróżnia historię po usunięciu taska i ponownym użyciu ID w innym terminie. Zgodnie z ADR minutowa rozdzielczość daty taska pozostaje znanym ograniczeniem; ta funkcja nie rozróżni dwóch rekordów z tym samym ID i tym samym createdAt w tej samej minucie.

## Deterministyczny mock

`MockAgent` jest przeznaczony do testów i przyszłych scenariuszy UI. Emisja jest synchroniczna, nie ma timera, sieci, modelu, subprocessów ani automatycznych zmian statusu. Każde zdarzenie otrzymuje stałe `runId` i `ownerGeneration` instancji; payload ich nie zastąpi. `subscribe` zwraca idempotentne unsubscribe.

Mock emituje tekst, pytania blokujące/nieblokujące, approval, sukces (`completed`) i błąd (`error`). Są to sygnały scenariusza, nie surowe komunikaty JSON-RPC. Konsument stosuje kontrakt przejść i aktualne interakcje; nie kopiuje sygnału sukcesu bezwarunkowo na status runa. Błąd utraty łączności również nie oznacza automatycznie `failed` — manager rozstrzyga potwierdzony błąd vs `unknown`.

Przykład użycia w teście UI z katalogu repo:

```typescript
import { MockAgent } from "./src/rac/testing/mock-agent.ts";

const agent = new MockAgent("run-1", "owner-1");
const unsubscribe = agent.subscribe((event) => console.log(event.type));
agent.emit({ type: "text", text: "Preparing plan" });
agent.emit({
  type: "question",
  interactionId: "plan-1",
  text: "Approve the plan?",
  blocking: true,
  options: ["Approve", "Revise"],
});
unsubscribe();
```

Nie dodajemy jeszcze interfejsu wielu providerów ani adaptera Codexa. Kształt znormalizowanych zdarzeń jest wewnętrzny i będzie rozwijany przy integracji. Można go importować w testach komponentów istniejącego dashboardu bez uruchamiania backendu czy drugiej tablicy.

## Weryfikacja

```bash
bun test --timeout=10000 src/test/rac-run-state.test.ts src/test/rac-mock-agent.test.ts
bun run check:types
bun run check
bun run build
```

Testy obejmują macierz wszystkich par lifecycle, blokujące interakcje, niezależność taska, wiele runów jednego taska, odzyskiwanie, slot i deterministyczne zdarzenia mocka. Nie zastępują testów rzeczywistego procesu/sandboxa, magazynu, autoryzacji, migracji, API ani UI, których ta zmiana nie implementuje.

Weryfikacja RAC-04: 85 nowych testow kontraktu/mocka przechodzi; dobrany zestaw regresji (RAC, spike, ID/prefix, readiness, dependency graph i terminal status) ma 229 testow, 0 bledow i 622 asercje w 8 plikach. Kontrola typow: 558 plikow bez bledow; Biome: 486 plikow bez bledow; build CLI oraz kompilacja run-state/mock dla target browser przechodza.
