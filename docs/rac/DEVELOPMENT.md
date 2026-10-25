# RAC development in the Backlog.md fork

## Environment

Work in `/Users/arek/projects/dashboard_online_md/Backlog.md` on `feature/remote-agent-control`. Origin is `Timorek/Backlog.md`; upstream is `MrLesk/Backlog.md`. Never run `backlog init` in this checkout.

`DEVELOPMENT.md` requires Bun **1.4.4** and Node **26.12.1 or later**. This setup downloaded the macOS arm64 releases and checked the official SHA-256 listings. Tools are local to the parent workspace, leaving Homebrew and global Node unchanged:

```bash
cd /Users/arek/projects/dashboard_online_md/Backlog.md
export PATH="/Users/arek/projects/dashboard_online_md/.rac-tools/bun-darwin-aarch64:/Users/arek/projects/dashboard_online_md/.rac-tools/node-v26.12.1-darwin-arm64/bin:$PATH"
bun --version
node --version
bun install --frozen-lockfile
```

For the network-restricted agent environment, 536 applicable locked npm archives were fetched using curl, verified against the lockfile's SHA-512 integrity, and seeded into a local Bun cache. The successful install used:

```bash
bun install --frozen-lockfile --cache-dir ../.rac-tools/bun-cache
```

The lockfile and package versions were unchanged. Binaries, dependency cache and node_modules are local artifacts, not committed. On another Mac, install the same documented tool versions and use `bun install --frozen-lockfile`; the absolute PATH above is specific to this workspace. Installed Codex: `codex-cli 0.162.1`. No Codex session, model run, tunnel or deployment service was started by setup. `groma agent-instructions` was attempted, but no Groma executable is installed; existing Groma-owned files were left intact.

## Launch the existing dashboard from source

With the PATH above, run in a normal macOS Terminal:

```bash
bun run cli browser --no-open --port 6421
```

Open <http://127.0.0.1:6421/board>. Port 6420 is used by another project on this Mac. Use 6421 for this fork. The CLI prints the actual port and can choose the next free one if needed. Stop with Ctrl+C. To open a browser automatically, omit `--no-open`.

The package script invokes `bun src/cli.ts`; `browser` constructs `BacklogServer` from `src/server/index.ts`, which imports `src/web/index.html`. This path uses the fork's source, not `/opt/homebrew/bin/backlog` (global version 1.55.2). Source CLI reports 1.55.3. `scripts/cli.cjs` is the packaged launcher and is not the development entry point.

## Development refresh

```bash
NODE_ENV=development bun --watch src/cli.ts browser --no-open --port 6421
```

Since RAC-08, the server uses guarded HTML/asset handlers for the same frontend and disables native Bun development HMR: native HTMLBundle auto-routes bypass fallback request checks. `--watch` still restarts the process when backend dependencies change. Restart manually after frontend edits as well; do not assume frontend HMR. Task Markdown updates use the existing `ContentStore`/watchers and dashboard WebSocket, independently of source refresh. No Vite server or second frontend is needed.

**Verification boundary:** native frontend HMR is disabled after RAC-08. The user's live RAC-08 smoke verified protected HTTP and frontend assets; it did not verify backend watch/restart or narrow-screen rendering. If a backend restart loses the client socket, refresh the page and check reconnection before relying on it.

## RAC backlog

```bash
bun run cli task list --labels rac --plain
bun run cli task list --labels rac --json
bun run cli task view BACK-790 --plain
bun run cli task list --labels rac --ready --exclude-status Done --sort priority --plain
```

28 roadmap keys map to allocated IDs `BACK-790` through `BACK-817`; `RAC-01` is `BACK-790`. The original package is preserved under `docs/rac/import/` (roadmap JSON formatting normalized). Import uses this checkout's CLI:

```bash
node docs/rac/import/import-backlog.mjs --project-root "$PWD" --dry-run
node docs/rac/import/import-backlog.mjs --project-root "$PWD"
```

Set `RAC_BUN` to an absolute Bun binary path if Bun is not on PATH. The imported plan is historical and must be reviewed when picking up a task. The setup explicitly preserves these plans even for future tasks; this is not the policy for creating new speculative plans. RAC-01's title/description is adapted on import because the fork already exists. Optional package milestones were not created; phase labels retain grouping.

Dry-run reads all CLI task pages and checks duplicate RAC prefixes and dependency cycles; it does not reserve IDs. The real CLI allocator chooses IDs under its lock. The patched dependency update sends the union of current and missing dependencies because `task edit --dep` replaces the complete field. Re-running the import finds existing tasks and does not replace their content. Use a single importer process per project; do not import while independently creating RAC tasks.

## Quality commands

### Local RAC configuration

From this checkout, using the source CLI:

```bash
bun src/cli.ts rac enable
bun src/cli.ts rac disable
```

By default both commands display macOS system authentication (Touch ID/account password).
Cancellation leaves settings unchanged. Apple Command Line Tools are required;
authorization on other OSes fails closed. Settings are outside Git under the
project's canonical path hash. Enabling does not start an agent or add UI buttons.
See [project configuration](PROJECT-CONFIGURATION.md) for the trust boundaries.

To explicitly skip the system prompt without elevating OS privileges:

```bash
bun src/cli.ts rac enable --skip-system-auth
bun src/cli.ts rac disable --skip-system-auth
```

The caller still needs write access to the private external settings directory.
This flag does not bypass path/permission checks or provide Windows ACL support.

Manual verification: cancel an enable attempt and check that no settings were
created; repeat and authenticate to enable; then authenticate to disable. For
existing settings, cancellation must preserve the file's contents. A restricted
agent session cannot substitute for this system-dialog check in a normal Terminal.

### Checks

RAC-08 local pairing, planning commands, API contracts and live smoke are described
in [LOCAL-API.md](LOCAL-API.md). After starting the source dashboard, run
`bun src/cli.ts rac pair`, open the returned URL and enter the one-use code.
`rac start <taskId>` currently starts planning only; Run buttons arrive in RAC-11.

RAC-07 storage checks use temporary external databases and need no Codex account:

```bash
bun test --timeout=10000 src/test/rac-store.test.ts src/test/rac-store-process.test.ts
```

See [PERSISTENCE.md](PERSISTENCE.md) for ownership, recovery, retention and platform
limits. The store remains an internal module until the manager/API tasks integrate it.

The RAC-06 adapter has a standalone verification script, described in
[CODEX-ADAPTER.md](CODEX-ADAPTER.md). From this checkout:

```bash
bun scripts/rac/codex-adapter-smoke.ts
bun scripts/rac/codex-adapter-smoke.ts --live --model gpt-6.1-sol
```

The default tests only handshake, thread policy and shutdown. Live mode adds
synthetic model execution/interruption in a temporary workspace, without granting
approvals. It does not use project tasks. Run it in a normal Terminal when the
restricted session reports a provider permission error.

```bash
bun run check:types
bun run check
bun run test
bun run build
bun test --timeout=10000 src/web src/test/web-*.test.tsx src/test/dependency.test.ts src/test/dependency-graph.test.ts
node --test scripts/update-nix.test.cjs
```

`bun run check` is read-only; `bun run lint` writes fixes and should not be used for a broad unrelated cleanup. The current repository's Biome config excludes TSX from the main check; DOM tests still cover those components. Run Node-specific tests with native Node when their fixtures depend on Node's version/runtime; `bun test` also discovers `.test.cjs` files but is not native Node.

## Browser verification

This agent session cannot bind local TCP sockets: Python loopback bind returns `PermissionError: [Errno 1] Operation not permitted`; CLI reports no available port. This is an environment restriction, not proof of a broken dashboard. The source build succeeds and scoped DOM/dependency tests pass, but they do not replace HTTP/browser checks.

User verification: the source dashboard runs on 6421, and the user confirmed steps 1–4 below. Steps 5–6 (refresh/HMR and viewport checks) remain unverified. The status round-trip used In Progress during verification; RAC-01 was subsequently marked Done.

Checklist:

1. Filter the existing board/tasks view by label `rac` and confirm all 28 tasks appear, including `BACK-790` and `BACK-817`.
2. Open `BACK-790`; inspect description, plan, criteria and the dependency graph. Open `BACK-791` and verify it depends on `BACK-790`.
3. Exercise a reversible description edit on `BACK-790`; save, verify via `bun run cli task view BACK-790 --plain`, then restore its original text through the UI.
4. Exercise a reversible status edit on `BACK-790`; restore In Progress. Do not mark blocked future work Done to test a control.
5. Update a task through CLI and confirm the open dashboard refreshes. Verify backend watch/restart in the development command; restart manually after frontend edits.
6. Check desktop and a narrow viewport, recording failures in RAC-01. Review pending task criteria before marking it Done.

Do not expose this local dashboard publicly yet. RAC-18/19 must deliver verified authorization and network protection first; see ADR-0001 D7 (`decisions/0001-rac-architecture.md`).

## Codex protocol spike (RAC-03)

The research-only probe and its limitations are documented in [RAC-03 spike](spikes/RAC-03-CODEX-APP-SERVER.md). Use `bun scripts/rac/codex-spike.ts --preflight`, `--live` or `--sandbox` from this checkout. Tests: `bun test --timeout=10000 scripts/rac/codex-spike.test.ts`. Live probes use synthetic inputs in a temporary workspace and require the user's existing Codex account; fixture tests do not validate model behavior. Agent-session EPERM prevents the real handshake and native sandbox from starting here. A separate run in the user's Terminal verified gpt-6.1-sol execution, fallback, approval denial, interrupt and EOF. The native sandbox read a synthetic file outside the workspace and denied loopback; credential isolation remains a runtime delivery gate. See the spike report for unresolved cases.
