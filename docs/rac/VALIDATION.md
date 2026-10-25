# RAC setup validation — 2026-10-24

## Baseline and scope

Clean `main` at `6f988de0` (Backlog.md 1.55.3) before setup. Origin: `https://github.com/Timorek/Backlog.md.git`; existing upstream: `https://github.com/MrLesk/Backlog.md.git`. Created `feature/remote-agent-control`. No resets, task initialization, pushes, manifesto changes or application-source changes were performed.

Tools: macOS arm64; pre-existing Node 25.6.1 and global Backlog 1.55.2. Setup uses SHA-256-verified Bun 1.4.4 and Node 26.12.1 under `../.rac-tools/`; Codex 0.162.1. Dependency install with `--frozen-lockfile` succeeded using integrity-verified locked tarballs in a local cache. package.json and bun.lock are unchanged. Groma instructions command was attempted but executable was unavailable; no Groma-owned files were edited.

## Results

| Check | Result | Evidence / limitation |
| --- | --- | --- |
| Initial Git audit | PASS | Clean branch, correct fork origin and upstream. |
| Source CLI version | PASS | `bun run cli --version` returns 1.55.3. |
| Baseline types | PASS | `bun run check:types`: no type errors in 551 files. |
| Final types | PASS | Rechecked after setup additions; no application TypeScript changed. |
| Biome | PASS | `bun run check`: 474 files, no fixes/errors after normalizing imported roadmap JSON. The initial check caught that new JSON's formatting; this was fixed without changing its data. |
| Build | PASS | `bun run build` exits 0; compiled `dist/backlog` produced (ignored, approximately 101 MiB). |
| Full baseline suite | FAIL / incomplete | `bun run test` exits 1 before the complete suite finishes. 89 passing and 8 failing completed test lines precede exit; these are not whole-suite totals. |
| Scoped UI/dependency suite | PASS | 471 tests, 0 failures, 2,700 assertions across 45 files; command below. |
| Native Node tool tests | PARTIAL | `node --test scripts/update-nix.test.cjs`: 3 pass, 1 fail. The failure requires a local registry listener and receives EPERM. Two Node-version-related cases that failed when discovered under Bun pass under native Node. |
| Import dry-run | PASS | Reads all local CLI pages, checks duplicate RAC keys and dependency cycles; 28 creates proposed, no IDs reserved. |
| Actual import | PASS | 28 tasks created by source CLI, BACK-790–817. |
| Import field integrity | PASS | CLI JSON task views compared against package: descriptions (RAC-01 adapted for existing fork), priorities, labels, all acceptance criterion text, original plans and mapped dependencies. RAC-01's original plan was subsequently replaced with the requested researched plan. |
| Repeat import | PASS | Existing task mapping found for all 28, no duplicate creation or dependency mutation. |
| RAC instructions | PASS | Original AGENTS.md content preserved verbatim; dedicated RAC section appended. CLI-first semantics, desktop-first posture and imported-plan exception made explicit. |
| Live dashboard and HTTP | PASS (user verified) | User started the source dashboard on 6421 (6420 belongs to another project), then confirmed the requested checks: 28 RAC tasks, task details, BACK-791 dependency on BACK-790, reversible description/status editing. Agent-side TCP bind remains restricted. |
| Live HMR / watcher refresh | NOT VERIFIED | Source supports development mode; real browser refresh/reconnect must be checked outside the restricted session. |

Scoped command:

```bash
bun test --timeout=10000 src/web src/test/web-*.test.tsx src/test/dependency.test.ts src/test/dependency-graph.test.ts
```

The DOM suite exercises existing board/detail/editing/dependency components. It does not prove that the 28 imported tasks render through a live HTTP server. The user subsequently confirmed the browser checklist items for task visibility, details, dependencies and reversible description/status editing on port 6421. HMR remains unverified.

## Baseline failures, not fixed by setup

- `scripts/ci-trust.test.cjs`: three workflow trust tests fail when their fixture server cannot bind port 0.
- `scripts/update-nix.test.cjs`: two generator tests fail the native Node gate under Bun discovery; both pass with Node 26.12.1. Its private-registry test still fails on `listen EPERM 127.0.0.1` under native Node.
- `src/test/tui-task-composer.test.ts`: watcher delivery times out in the canonical persistence test. Cause was not established; do not classify it as a confirmed product bug or claim it is fixed.
- `src/test/cli.test.ts`: browser port-selection test fails under the bind restriction; a subsequent port-0 CLI path terminates the full runner before a complete summary.

Independent bind reproduction: `python3 -m http.server 18764 --bind 127.0.0.1 ...` returns `PermissionError: [Errno 1] Operation not permitted`. `bun src/cli.ts browser --no-open --port 6420` reports no available port. Native Node reproduces `listen EPERM` on loopback. Changing ports does not resolve a policy that forbids listening.

## Durable outcome and outstanding work

`RAC-01` / `BACK-790` is assigned to `@codex` and is **Done** after user-confirmed dashboard verification on port 6421. All four acceptance criteria are satisfied: the running dashboard was verified by the user, baseline failures are documented, extension points are mapped, and the upstream update procedure is recorded. No future RAC task was started. Live HMR/reconnection and narrow-screen checks were not part of the user confirmation and remain unverified; no success is claimed for them.

The architecture is a proposal: existing Bun backend plus optional in-process RAC manager, canonical shared CLI/API semantics, Codex stdio adapter, existing React UI, separate operational run history, and authentication before remote exposure. RAC-02 reviews those decisions after RAC-01 is verified.

Temporary execution logs and exact CLI comparison output remain at `/tmp/backlog-rac-setup.NlrkPR/` for this machine; this report and `IMPORT.md` preserve the relevant evidence when temporary files disappear. Runtime binaries and dependency cache are outside the Git repository and are intentionally not committed.
