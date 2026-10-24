---
id: BACK-794
title: '[RAC-05] Rejestr projektów i allowlista workspace'
status: In Progress
assignee:
  - '@codex'
created_date: '2026-10-24T08:05:00Z'
updated_date: '2026-10-24T17:45:00Z'
labels:
  - rac
  - m1-local-mvp
  - backend
  - security
  - mvp
dependencies:
  - BACK-791
  - BACK-793
documentation:
  - docs/rac/decisions/0001-rac-architecture.md
  - docs/rac/PROJECT-CONFIGURATION.md
priority: high
ordinal: 404000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Dodaj konfigurację katalogów repozytoriów dostępnych agentowi. W MVP obsłuż jeden projekt; bez abstrakcji wielu projektów w MVP. Ścieżek nie wolno podawać bezpośrednio z requestu WWW. Backend wybiera katalog wyłącznie z konfiguracji allowlisty. Odrzuć path traversal i linki wychodzące poza root.

Ustalenia po review ADR-0001 (2026-10-24; zaakceptowane przez użytkownika):
Q1=A: MVP ma jeden kanoniczny root powiązany z projectKey; żądania klienta nie wskazują dowolnego projectId/cwd. Dodaj kanoniczne lokalne polecenia backlog rac enable/disable; ustawienia i zgoda na włączenie są poza repo, wymagają autoryzacji lokalnego człowieka. Repo config ani PUT /api/config nie mogą włączyć RAC lub osłabić polityki. Po przeniesieniu repo powstaje nowa historia (Q7g), bez relinkowania w MVP.

Późniejsza jawna zmiana użytkownika: lokalne rac enable/disable otrzymują --skip-system-auth, pomijające systemowe potwierdzenie bez nadawania praw administratora OS. Zastępuje to poprzednie bezwarunkowe wymaganie obecności człowieka przy włączeniu. Domyślne komendy nadal wymagają potwierdzenia; ustawienia repo i API nie mogą ustawić bypassu. Proces z prawem zapisu konfiguracji może użyć flagi, również agent z takimi prawami.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Backend odczytuje jedną skonfigurowaną ścieżkę projektu
- [ ] #2 Walidacja blokuje niezgodny projectKey, nieuprawnioną sesję oraz wyjście poza skonfigurowany katalog
- [ ] #3 Backend nigdy nie używa ścieżki z payloadu żądania jako cwd
- [x] #4 Testy obejmują nieprawidłowe i względne ścieżki
- [x] #5 CLI enable/disable jest dostarczone przed adapterem UI; domyślnie wymaga autoryzacji systemowej. Jawna lokalna flaga --skip-system-auth pomija ten krok na żądanie użytkownika, bez nadawania uprawnień OS; konfiguracja repo i API nie mogą jej ustawić.
- [ ] #6 Sesja, żądania i deskryptor właściciela są związane z projectKey kanonicznego root, bez wyboru dowolnej ścieżki z API
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 bun run check:types passes when TypeScript touched
- [x] #2 bun run check . passes when formatting/linting touched
- [x] #3 bun test (or scoped test) passes
<!-- DOD:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Potwierdzic gotowosc BACK-794 i Done zaleznosci; zapisac In Progress i @codex przed implementacja. Zachowac obecny fork i galaz; bez PR do upstreamu.
2. Zbadac wzorzec rejestracji komend CLI, konwencje bezpiecznych zapisow oraz punkty styku RAC. Utrwalic decyzje lokalnej autoryzacji czlowieka przed implementacja zależnej czesci: sam --yes/TTY/zmienna srodowiskowa nie dowodzi obecnosci czlowieka.
3. Zaimplementowac kanoniczny absolutny root przez realpath+stat i projectKey SHA-256; jeden root na konfiguracje, brak rejestru wielu projektow. Odrzucac relative paths, traversal, symlinki poza root i dane/config pod checkoutem. Zapis lokalny poza repo, domyslnie RAC off; przeniesione repo nowa historia.
4. Dodac minimalny lokalny magazyn settings.json z walidacja schematu/root/key i ograniczonymi prawami. Nie uzywac backlog/config.yml do wlaczania RAC; uszkodzona/niewiarygodna konfiguracja fail closed. Zapis konfiguracji dopiero po rzeczywistej lokalnej autoryzacji czlowieka.
5. Dostarczyc kanoniczne backlog rac enable/disable w CLI bez flag omijajacych autoryzacje; pozostałe platformy bez bezpiecznej implementacji auth odmawiaja zamiast wlaczac bez ochrony. Implementacja konkretnego mechanizmu wymaga zaakceptowanej decyzji. Nie uruchamiac agenta ani endpointu wykonawczego.
6. Dostarczyc wspolna walidacje kontekstu projektu/sesji/wlasciciela: projekt tylko z konfiguracji, zgodny projectKey i generacja, zadne cwd/path/projectId z body nie staje sie cwd. To kontrakt dla przyszlego backendu, nie gotowy mechanizm loginu/API.
7. Testy: kanonizacja, zle i wzgledne sciezki, traversal/symlink escapes, off/disabled/niepoprawne JSON, odmowa auth bez zapisu, sesje innych projektow/generacji, ignorowanie/odrzucanie klientowego cwd oraz komendy/help CLI. Uruchomic dobrane testy, types, Biome i build.
8. Udokumentowac konfiguracje i ograniczenia zabezpieczen w docs/rac, uaktualnic ADR i task; zaznaczac tylko udowodnione AC. Lokalny commit po zakonczeniu; bez automatycznego push i bez nastepnego taska.

Decision approved by user: macOS system authentication (Touch ID/account password) gates local enable/disable. Implement a fresh LAContext with no Touch ID reuse; compile/run only fixed embedded Swift source through absolute system tooling with a private temporary module cache and sanitized environment. No bypass CLI flags. Authorization failure leaves configuration unchanged. Implement atomic POSIX-private settings writes and tests with an injected internal test authorizer; production CLI always selects the native authorizer. Validate helper compilation and document that interactive system UI needs a normal Terminal if blocked by this session.

User explicitly overrides the earlier mandatory native confirmation: add --skip-system-auth to local rac enable/disable (clearer than --admin; no OS elevation). Default calls still use native authentication. The flag skips only the native helper, retaining private external settings, canonical identity/path checks and atomic writes. It is not a web/repo config option and does not bypass Windows ACL requirements. Test default authorization, flag round trips and validation, then rebuild, document the changed trust boundary and commit locally.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
RAC-05 progress: implemented src/rac/project-context.ts and project-settings.ts plus tests. Canonical root/SHA-256 identity, absolute/traversal/symlink validation, trusted session/owner project-generation binding, disabled-by-default external settings reader, strict schema/identity/POSIX permission checks, no repository-config enablement. Documentation: docs/rac/PROJECT-CONFIGURATION.md. Verification: 110 tests / 367 assertions across four RAC test files PASS; type check 562 files PASS; full Biome check 490 files PASS. No AC checked and task remains In Progress. Awaiting explicit architectural/workflow decision required by task-execution step 7: native macOS LocalAuthentication (Touch ID/system account password, fresh LAContext, no bypass flags) for local rac enable/disable, unsupported platforms fail closed. Authorization writer and CLI commands deliberately not implemented before that decision. No push or next task.

User approved native macOS authorization. Implemented backlog rac enable/disable through the existing project resolver, with no bypass flags or web enable endpoint. Fresh LAContext/deviceOwnerAuthentication/zero Touch ID reuse; fixed embedded Swift helper via absolute system tool and minimal environment; no password capture. Added atomic private settings writer with authorization before mutation and root/data revalidation afterwards. Verification: 121 tests, 403 assertions, 5 RAC files PASS; full type check 565 files PASS; Biome 493 files PASS; CLI build and compiled rac help PASS; Swift helper SDK type-check PASS; git diff --check PASS. Real helper attempted in this restricted session: canEvaluatePolicy returned unavailable, helper exit 1, no settings change attempted. Native positive authentication and cancellation remain to verify in a normal macOS Terminal. Keep task In Progress, do not claim full HTTP/session authentication: this task supplies shared context guards; handlers and real authenticated session/ownership records remain gated in subsequent tasks per approved plan. Preserve unproven AC unchecked until final review/manual verification. No push or next task.

User observed the native authentication dialog and cancelled it. Current local settings read enabled=false; successful native confirmation remains unverified. User explicitly declined persistent compiler caching as unnecessary for this rarely used operation; experimental cache changes were removed before commit. Keep the existing temporary helper/cache, fresh authentication and no bypass. Add only a CLI notice that opening the system dialog may take tens of seconds.

Follow-up verification after removing cache optimization: 5 CLI tests / 12 assertions PASS, CLI rebuild PASS, Biome for the changed CLI file PASS, git diff --check PASS. Only the startup-delay notice and this task record differ from the previous commit. No native authorization or settings behavior changed.

Added --skip-system-auth (recommended clearer name than --admin) to both local enable/disable commands at explicit user request. Default still invokes the native authorizer; skip mode never invokes it, keeps path/root/private-file/atomic-write checks, and grants no OS elevation. No repo config, web flag, permanent compiler cache or Windows ACL bypass. Updated ADR, AGENTS.md and development/config docs to remove the old unconditional human-presence guarantee. Tests: CLI/default-versus-skip round trips plus writer guards; 125 tests / 424 assertions across 5 RAC files PASS; types 565 files PASS, Biome 493 files PASS, source build and compiled help PASS, diff check PASS. Earlier user password entry was verified via actual local enabled=true, but no real project setting was changed during these flag tests. Remaining backend integration ACs stay unchecked; no next task or push.
<!-- SECTION:NOTES:END -->
