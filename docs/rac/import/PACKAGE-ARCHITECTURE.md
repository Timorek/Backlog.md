# Architektura RAC

## Projekt techniczny

```text
Telefon / Browser
  | HTTPS + Cloudflare Access
  v
Cloudflare Tunnel --> 127.0.0.1:6420 (Backlog Web + RAC API)
                          |  task read: istniejące API/CLI Backlog.md
                          |  Run CRUD / SQLite
                          |  server->client events: SSE z event IDs
                          v
                        Agent Manager (Node/TypeScript)
                          | localhost process stdio JSON-RPC
                          v
                        Codex App Server
                          | model requests + sandbox approvals
                          v
                        allowlisted Git working directory / worktree
```

*Na wybranym hoście usługowym (w MVP macOS) zostaw web UI na loopback (127.0.0.1), a tunel uruchamiaj obok backendu; jest to połączenie wychodzące. Codex app-server nie ma publicznego endpointu. Development na macOS nie przesądza o hoście końcowym; runner Windows można dodać jako wariant deploymentu.*

## Warstwy

1. **Backlog adapter** — czyta taski z istniejącego źródła prawdy; nie implementuje parsera Markdown na nowo.
2. **RAC API** — auth, autoryzacja, idempotencja, walidacja projectId/taskId, sesje i zdarzenia.
3. **Agent Manager** — uruchomienia agentów, pending interactions, approvals, queue.
4. **Codex adapter** — JSON-RPC app-server, w tym turn/start, turn/steer, turn/interrupt, request/response i zdarzenia.
5. **Persistence** — mała baza SQLite (do potwierdzenia w ADR) dla runs, messages, approvals, zdarzeń.
6. **Backlog UI extension** — przycisk Run, panel logów, interakcje, statusy i review.

## Model danych — propozycja (do doprecyzowania w RAC-02)

- Project: id, configuredRoot, enabledAgentProviders.
- AgentRun: id, taskId, projectId, provider, status, threadId, currentTurnId, startedAt, finishedAt, errorSummary.
- RunEvent: id, runId, sequence, timestamp, kind, normalizedPayload.
- PendingInteraction: id, runId, requestId, interactionType, schema/options, openedAt, expiresAt, resolvedAt, decision.
- AgentSettings: provider, maxConcurrency, sandboxMode, approvalPolicy (bez sekretów).

## API — docelowe szkice kontraktów (nie istnieją jeszcze)

- `POST /api/rac/runs` — create run (`taskId`, `projectId`, `idempotencyKey`).
- `GET /api/rac/tasks/:taskId/runs` — historia uruchomień.
- `GET /api/rac/runs/:runId` — szczegóły.
- `GET /api/rac/runs/:runId/events?after=<sequence>` — historia.
- `GET /api/rac/runs/:runId/stream` — stream SSE ze wznowieniem.
- `POST /api/rac/runs/:runId/cancel` — przerwanie aktywnej tury.
- `GET /api/rac/runs/:runId/interactions` — oczekujące pytania i zgody.
- `POST /api/rac/interactions/:id/answer` — odpowiedź na pytanie.
- `POST /api/rac/interactions/:id/decision` — approve / deny z walidacją.
- `GET /api/rac/health` — stan runnera i hosta.

**Bezpieczeństwo:** endpointy mutujące wymagają zweryfikowanej sesji, samego Cloudflare Access nie traktujemy jako wystarczającej walidacji uprawnień wewnątrz backendu. Zakaz wprowadzania arbitralnego `cwd`, `command` lub `binary` z przeglądarki. Taski są nieufnym wejściem, podobnie jak output agenta; logi wymagają sanitizacji. Process spawning musi używać stałego binarnego programu i listy argumentów bez `shell:true`.

## Semantyka pytań

Ścieżka A: app-server wysyła `item/tool/requestUserInput` -> RAC zapisuje requestId -> UI pozwala odpowiedzieć -> RAC odpowiada na **ten sam request** -> event `serverRequest/resolved` zamyka interakcję.

Ścieżka B: narzędzie nie jest dostępne w trybie agenta -> agent zwraca ustrukturyzowane pytanie i kończy bieżącą turę -> RAC zapisuje oczekiwanie -> użytkownik odpowiada -> `turn/start` w **tym samym thread**. Nie przedstawiamy tego jako wstrzymanej aktywnej tury.

Aprobaty komend i plików są osobne od pytań biznesowych. Brak odpowiedzi nie oznacza automatycznego approve.

## Polityka bezpieczeństwa (MVP)

- Access + MFA + backend auth i CSRF.
- Default sandbox: możliwie restrykcyjny; nie zakładać uprawnień admina; obowiązkowa osobna akceptacja podwyższonych uprawnień.
- Przy zewnętrznym zadaniu nie zakładać, że instrukcje taska są bezpieczne. Obróbka jako untrusted text.
- Tylko allowlistowane repozytoria, jeden concurrency slot w MVP.
- Persystencja request IDs i run IDs; po restarcie stan może stać się UNKNOWN, nie fałszywy RUNNING.
- Timeout, backpressure i limity logów; redakcja wrażliwych ciągów.
- Nie zapisywać tokenu Telegram, Cloudflare ani poświadczeń Codexa w repozytorium.

## Testy obowiązkowe

- Unit: state transitions, adapter event mapping, redaction, authorization.
- Integration: JSON-RPC mock, Backend/SQLite migrations, Auth + CSRF, retries/idempotency.
- Playwright: desktop/mobile, reconnect, question flow, denial of approval, offline UI.
- macOS manual: rzeczywisty Codex i worktree, build po aktualizacji upstream. Jeśli runner ma działać na Windows, wykonaj dodatkowe testy systemowe Windows.

## macOS — lokalny development i uruchamianie

- Mac (Apple Silicon albo Intel): uruchamiaj lokalny test App Server przez stdio. Backend powinien używać Node `child_process.spawn` z argumentami, bez `shell:true`.
- Uruchomienie usług w tle: `launchd` LaunchAgent dla sesji użytkownika z `KeepAlive` i własnymi logami. Zadbaj o rozwiązywanie PATH oraz `WorkingDirectory` niezależnie od powłoki interaktywnej.
- LaunchAgent nie jest równoważny usłudze startującej przed logowaniem. Jeśli potrzebne uruchomienie bez zalogowania, wymagany osobny audyt uprawnień i konfiguracji usługi.
- Zamknięty MacBook / uśpiony host: agent nie kontynuuje pracy. W dashboardzie stan offline i odzyskiwanie wydarzeń po wznowieniu.
- Gdy ostateczny komputer domowy działa na Windows, rozwijaj kod na Macu, ale przenieś usługę wykonawczą do Windows i wdrażaj odpowiedni wariant autostartu oraz testów. Nie wystawiaj surowego JSON-RPC ani lokalnego runnera na świat.
