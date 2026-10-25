# Read This First

At the beginning of each conversation, read [MANIFESTO.md](MANIFESTO.md) in the
repository root before doing anything else. It is the project's constitution: who
Backlog.md serves, its core loop, source of truth, surface hierarchy, interface posture,
design principles, boundaries, and risks. All architecture and product decisions must
align with it.

If a request appears to conflict with the manifesto, or would materially change a
principle in it, surface the conflict and ask Alex rather than silently proceeding. Do
not edit the manifesto as a side effect of implementation; changes to it require an
explicit product decision.

When you're working on a task, you should assign it yourself: -a @{your-name}

In addition to the rules above, please consider the following:
At the end of every task implementation, try to take a moment to see if you can simplify it. 
When you are done implementing, you know much more about a task than when you started.
At this point you can better judge retrospectively what can be the simplest architecture to solve the problem.
If you can simplify the code, do it.

## Simplicity-first implementation rules

- Prefer a single implementation for similar concerns. Reuse or refactor to a shared helper instead of duplicating.
- Keep APIs minimal. Favor load + upsert over load/save/update, and do not add unused methods.
- Avoid extra layers (services, normalizers, versioning) unless there is an immediate, proven need.
- Keep behavior consistent across similar stores (defaults, parse errors, locking). Divergence requires a clear reason.
- Don't add new exported helpers just to compute a path; derive from existing paths or add one shared helper only when reused.

## UI descriptions

Do not add subtitles, helper text, or descriptive copy beneath headings, labels, cards, or settings by default. Prefer
one concise, self-explanatory heading or label. Only add supporting copy when the user explicitly asks for it or when it
is necessary to prevent misunderstanding or error, and never use it to restate the heading.


## Commands

### Development

- `bun i` - Install dependencies
- `bun run check:types` - Type-check code with Bun
- `bun run check .` - Run all Biome checks (format + lint)
- `bun run build` - Build the CLI tool
- `bun run cli` - Uses the CLI tool directly

### Testing

- `bun run test` - Run all tests (applies the same test timeout CI uses)
- `bun test --timeout=10000 <filename>` - Run specific test file

### Configuration Management

- `bun run cli config list` - View all configuration values
- `bun run cli config get <key>` - Get a specific config value (e.g. defaultEditor)
- `bun run cli config set <key> <value>` - Set a config value with validation

## Core Structure

- **CLI Tool**: Built with Bun and TypeScript as a global npm package (`npm i -g backlog.md`)
- **Source Code**: Located in `/src` directory with modular TypeScript structure
- **Task Management**: Uses markdown files in `backlog/` directory structure
- **Workflow**: Git-integrated with task IDs referenced in commits and PRs

## Agent POV

- Treat Backlog.md as a shipped CLI/MCP binary that may be used from other repositories where agents cannot inspect this source tree.
- Backlog.md is not a supported JavaScript or TypeScript library API for external consumers. Do not treat exported source symbols, classes, or methods in `/src` as stable public interfaces unless they are explicitly documented in shipped CLI/MCP/instruction surfaces.
- Use only the stable public surface—CLI behavior, MCP tools/resources and schemas,
  configuration, CLI help, and shipped instruction files—when deciding what external
  agents can rely on or evaluating compatibility. Internal TypeScript exports are
  implementation details unless public docs explicitly promise them.
- Do not assume external agents know internal implementation details, constants, or source-only conventions.
- When reviewing changes, do not ask for compatibility shims just because a source-level method exists or was removed. Only preserve compatibility for behavior that is part of the documented CLI, MCP, config, or instruction contract.
- If a convention matters for agent behavior, document it in the public MCP/instruction surface rather than relying on source-code discovery.

## Maintainer Workflow Guardrails

- Treat GitHub issues as reports, proposals, or evidence, not implementation specs. Do not automatically implement the requested solution; first evaluate whether the change fits Backlog.md's public CLI/MCP/instruction surface and current documented behavior.
- Escalate ambiguous product behavior to Alex before implementation. For example, pause before deciding whether ordinal-only task ordering changes should update edit metadata.
- PRs should normally link to a scoped issue first. If a broad feature PR or request has no issue, ask for an issue or discussion before implementation rather than turning the PR into the scope definition.
- Investigations should not create implementation PRs by default. Leave findings as comments, reports, or notes unless a narrow accepted fix is clear.
- Use the documented `backlog task create` workflow for task creation. Do not manually edit task files, pick IDs, pre-reserve IDs, or create coordination-only IDs as a workaround; rely on the CLI allocator and lock to assign task IDs.
- When acting publicly on Alex's behalf, use neutral maintainer language and identify yourself as `Alex's Agent:` if identification is needed. Do not reveal private strategy, roadmap, or status framing; keep scope decisions grounded in the project's public docs and shipped behavior.

## Code Standards

- **Runtime**: Bun with TypeScript
- **Formatting**: Biome with tab indentation and double quotes
- **Linting**: Biome recommended rules
- **Testing**: Bun's built-in test runner
- **Pre-commit**: Husky + lint-staged automatically runs Biome checks before commits

The pre-commit hook automatically runs `biome check --write` on staged files to ensure code quality. If linting errors
are found, the commit will be blocked until fixed.

## Git Workflow

- **Branching**: Use feature branches when working on tasks (e.g. `tasks/back-123-feature-name`)
- **Committing**: Use the following format: `BACK-123 - Title of the task`
- **PR titles**: Use `{taskId} - {taskTitle}` (e.g. `BACK-123 - Title of the task`)
- **Github CLI**: Use `gh` whenever possible for PRs and issues

### Releases

1. Merge the reviewed changes after required CI checks pass.
2. Create and publish a GitHub Release from the merged commit with a new `vMAJOR.MINOR.PATCH` tag.
3. Monitor the Release workflow until platform packages, the npm launcher, and release assets are published. The workflow prepares the tagged source and bumps `package.json` automatically.

Do not manually bump the root `package.json` version or start a release with a raw tag push.

<!-- BACKLOG.MD GUIDELINES START -->
<CRITICAL_INSTRUCTION>

## Backlog.md Workflow

This project uses Backlog.md for task and project management.

**At the beginning of each conversation in this project, run `backlog instructions overview` before answering or taking action. Re-read it only if you have not read it yet in the current conversation.**

Use the overview to decide whether to search, read, create, or update Backlog tasks.

Before task lifecycle actions, read the matching detailed guide:
- `backlog instructions task-creation` before creating or splitting tasks
- `backlog instructions task-execution` before planning, changing status or assignee, adding a plan or implementation notes, or implementing task work
- `backlog instructions task-finalization` before checking acceptance criteria, writing final summaries, or moving tasks to terminal statuses

Use `backlog <command> --help` before running unfamiliar commands. Help shows options, fields, and examples.

Do not edit Backlog task, draft, document, decision, or milestone markdown files directly. Use the `backlog` CLI so metadata, relationships, and history stay consistent.

</CRITICAL_INSTRUCTION>
<!-- BACKLOG.MD GUIDELINES END -->

<!-- groma:start -->
## Groma

This project uses Groma. Before you scan, inspect, or curate architecture, or change files for a Backlog task, run `groma agent-instructions` and read the guide it names for that job. When it reports a first scan, ask the user whether they want you to curate the architecture. Do not edit Groma-owned architecture files directly.
<!-- groma:end -->

## Remote Agent Control (RAC) — Development Rules

### Architecture

- Develop RAC directly inside this Backlog.md fork. Use its existing frontend, backend, CLI, API, task models and components; do not create a separate application or Kanban dashboard or duplicate existing capabilities.
- Preserve MANIFESTO.md: RAC is optional, Markdown tasks remain the source of truth, and shared semantics and the canonical CLI precede UI adapters. The dashboard is the primary human interface for this fork; it does not replace CLI semantics. Preserve desktop-first behavior and support phone access without promising mobile feature parity.
- Keep modules small and compatible with upstream. Development runs on macOS; do not assume the eventual agent host OS. Validate platform-dependent spawning, sandboxing, paths and service management on each supported host.
- Record architectural decisions in docs/rac/. The current architecture document is a proposal for RAC-02, not approval to implement later tasks.

### Task management

- Backlog.md is the source of truth for RAC requirements, dependencies and statuses. Use the existing CLI for every task mutation; never edit task Markdown directly or allocate IDs manually.
- RAC-XX is a roadmap key in the title; use the actual BACK-* ID returned by the CLI. Find tasks with `bun run cli task list --labels rac --json`.
- Before starting, read the description, acceptance criteria, dependency graph and Implementation Plan. Start only when dependencies are fulfilled; missing or ambiguous identities block work.
- Assign active work to yourself and use the configured statuses (To Do, In Progress, Done). Record meaningful decisions in the task or docs/rac/.
- Imported package plans are preserved as historical proposals at the user's explicit request. Revalidate and replace them with a researched plan when picking up a task; importing a plan does not activate the task or approve its architecture. For newly authored future tasks, follow the existing no-speculative-plan rule.
- Verify acceptance criteria and record test results before checking items or completing work. Do not mark incomplete work Done; leave failed checks, blockers and manual verification steps visible.

### Standard Codex workflow

When the user says `Zrób następny task RAC`:

1. Read the current backlog through the CLI.
2. Inspect dependencies and statuses; use the readiness filter and verify the selected task's dependency graph.
3. Select the highest-priority ready, unfinished RAC task; break equal-priority ties by RAC roadmap order.
4. Read all requirements for that task.
5. Prepare or revalidate its Implementation Plan and save it through the CLI. Obtain review before implementation when required by the existing task-execution rules.
6. Implement the scoped change using existing Backlog.md modules.
7. Add or update meaningful tests.
8. Run the relevant quality checks.
9. Verify Acceptance Criteria with evidence.
10. Update the task status, acceptance checklist, test record and durable documentation.
11. Report the result and remaining limitations.

If the user specifies a task, work on that task instead, while honoring its dependencies. Stop after the current task unless the user explicitly requests multiple tasks. Do not automatically start the next one.

### Safety

- Obtain permission for destructive Git operations. Keep changes within the task scope.
- Do not run agents with unlimited permissions or expose an unsecured command-execution API.
- Keep secrets and tokens out of the repository. Use explicit workspace allowlists and bounded sandbox/approval policies.
- Local `rac enable/disable` uses system authentication by default. The user explicitly approved `--skip-system-auth` as a CLI-only bypass; it does not elevate OS privileges or bypass filesystem, HTTP or agent-operation policies. Do not enable RAC automatically as part of implementing a task.
- Never push automatically; require an explicit user instruction to push.
- Keep the existing dashboard on loopback until backend authentication, authorization and CSRF protections are verified. Do not publish raw Codex App Server or runner endpoints.

### Continuity

- AGENTS.md stores permanent project rules.
- Backlog.md stores task requirements, plans, evidence and status.
- docs/rac/ stores architectural decisions and development instructions.
- Save important findings in the repository rather than only in conversation history. Report conflicts with existing rules and propose a resolution; do not silently rewrite the manifesto.
