# Backlog.md Remote Agent Control (RAC) — macOS development edition

Backlog 28 zadań w formacie Backlog.md dla forka [MrLesk/Backlog.md](https://github.com/MrLesk/Backlog.md). **Rozwój i lokalne testy na macOS**. Docelowy komputer uruchamiający agentów może być Maciem lub Windowsem — tę decyzję opisuje RAC-02. W pierwszej wersji jest jeden lokalny runner; wydzielony host to przyszłe rozszerzenie.

## Zawartość

- `roadmap.json` — 28 tasków, kryteria akceptacji, priorytety, fazy i zależności.
- `import-backlog.sh` + `import-backlog.mjs` — importer na Maca. Tworzy taski oficjalnym CLI, nie nadpisuje istniejących; idempotencja na podstawie `[RAC-XX]` w tytule.
- `tasks-preview/` — podgląd 28 plików Backlog.md. **Nie kopiuj ich bezpośrednio do istniejącego repo**, bo mają przykładowe identyfikatory `TASK-*`.
- `ARCHITECTURE.md` — architektura, bezpieczeństwo, interakcje, macOS i ewentualny runner Windows.

## Import na Macu

Wymagania: Node.js 20+ (z dostępem do `node`), działające polecenie `backlog` z obsługą JSON i poprawnie zainicjalizowane repo Backlog.md. Repozytorium musi być już dostępne na dysku. Nie uruchamiaj `backlog init` wewnątrz już skonfigurowanego forka. Zrób commit/backup przed importem.

```bash
cd ~/Downloads/BacklogMD-Remote-Agent-Control-macOS
bash ./import-backlog.sh --project-root "$HOME/Projects/Backlog.md" --dry-run
bash ./import-backlog.sh --project-root "$HOME/Projects/Backlog.md"
```

Dla etapów jako milestone (opcjonalnie, po upewnieniu się, że fork obsługuje podane komendy):

```bash
bash ./import-backlog.sh --project-root "$HOME/Projects/Backlog.md" --with-milestones
```

Importer używa istniejącego `backlog task list --json`. Zwrócone identyfikatory są mapowane do zależności, więc nie zakłada `TASK-1...28`. Powtórne wywołanie pomija istniejące taski i dopisuje brakujące zależności, nie zmienia treści taska zmodyfikowanego później ręcznie. `--with-milestones` używa listy rzeczywistych plików milestone zwróconych przez CLI i przerywa z błędem, gdy formatu listy nie da się potwierdzić; nie tworzy „wirtualnych” milestone.

W repo:

```bash
cd "$HOME/Projects/Backlog.md"
backlog board
backlog task list --labels rac --plain
backlog browser
```

Jeśli Twoje repo forka ma już zadania, importer nie nadpisuje ich ID. Jeżeli potrzebujesz odrębnego backlogu projektu, utwórz osobny folder na taski, ale wtedy nie będzie to backlog forka, który modyfikujesz.

## Fazy

| Faza | Taski | Wynik |
|---|---|---|
| M0 Discovery | RAC-01–04 | Audyt forka, ADR, spike Codex na Macu |
| M1 Local MVP | RAC-05–10 | Agent Manager, start/stop, logi i persystencja |
| M2 Dashboard | RAC-11–17 | Run, chat, pytania i aprobaty |
| M3 Remote Access | RAC-18–21 | Bezpieczna publikacja tablicy, launchd i telefon |
| M4 Advanced | RAC-22–26 | Worktree, kolejka, przegląd zmian, powiadomienia, Claude |
| M5 Release | RAC-27–28 | Security, testy i dokumentacja |

Przy wdrożeniu na Windows powstaje osobny wariant RAC-20: autostart przez Windows Task Scheduler/usługę. Kod UI, API i większość adaptera Node pozostaje bez zmian, ale sandbox i operacje plikowe wymagają walidacji systemowej.

## Ograniczenia macOS

- `launchd` LaunchAgent uruchamia się po zalogowaniu użytkownika, nie jest gwarancją usługi działającej jeszcze przed loginem.
- Uśpiony Mac **nie wykona taska**; przy MacBooku znaczenie ma też zamknięcie klapy. Nie obiecuj automatycznego wybudzania pod żądanie HTTPS.
- `launchd` ma ograniczone zmienne środowiskowe; jawnie skonfiguruj ścieżkę do `node`, `codex`, dostęp do repozytoriów i katalogu danych.
- Codex app-server działa lokalnie przez stdio; nie wystawiaj go publicznie.
- Cloudflare Access + auth backend + CSRF, allowlista repo, ograniczone uprawnienia runnera, osobne zatwierdzenia zmian i komend są obowiązkowe przed dostępem przez internet.
- Zdarzenia `tool/requestUserInput` wymagają weryfikacji na rzeczywistym modelu/trybie (RAC-03); fallback może wymagać nowej tury zamiast wstrzymanej tury.

## Źródła

- https://github.com/MrLesk/Backlog.md
- https://github.com/MrLesk/Backlog.md/blob/main/CLI-INSTRUCTIONS.md
- https://learn.chatgpt.com/docs/app-server
