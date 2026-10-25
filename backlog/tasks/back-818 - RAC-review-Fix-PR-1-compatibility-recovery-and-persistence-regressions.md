---
id: BACK-818
title: '[RAC review] Fix PR #1 compatibility, recovery and persistence regressions'
status: In Progress
assignee:
  - '@codex'
created_date: '2026-10-25T12:39:00Z'
updated_date: '2026-10-25T13:22:00Z'
labels:
  - rac
dependencies: []
references:
  - https://github.com/Timorek/Backlog.md/pull/1#pullrequestreview-5643177040
documentation:
  - docs/rac/PR-1-REVIEW.md
priority: high
type: bug
ordinal: 428000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The reviewed RAC foundation breaks existing dashboard clients and leaves runs unrecoverable after uncertainty. The user authorized fixing the confirmed findings; preserve local execution security and the explicitly staged roadmap. Do not remove required future adapter/store contracts or claim untested launchd evidence.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Existing dashboard and legacy local clients work while foreign browser mutations remain rejected and RAC retains authentication/CSRF/JSON controls.
- [x] #2 Authenticated human resolve through CLI/API releases unknown slots only after explicit stop confirmation and never resumes or kills an unverified process.
- [x] #3 Task lookup honors the configured prefix and Git remains optional; expected provider interruption/validation errors do not unnecessarily become unknown.
- [x] #4 Common env/URL/private-key secrets are redacted, oversized serialized messages are bounded without wedging the run, and transient credential retention expires.
- [x] #5 Terminal interactions from older owners can be explicitly retired without replay; registration of unsupported route shapes fails closed and cache/error semantics are preserved.
- [x] #6 Tests, documentation and task statuses match verified evidence, including the outstanding actual launchd gate.
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 bun run check:types passes when TypeScript touched
- [x] #2 bun run check . passes when formatting/linting touched
- [x] #3 bun test (or scoped test) passes
<!-- DOD:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Preserve existing local changes and record the authorized review scope. Correct RAC-06 launchd evidence/status via CLI. 2. Restore legacy non-browser API and bodyless/plain-text dashboard compatibility without accepting foreign browser mutations; allow safe cross-site navigation, preserve ordinary error handling and asset caching; make unsupported native route shapes fail closed. 3. Resolve project-prefixed numeric IDs, allow non-Git projects, add authenticated/idempotent CLI and HTTP human resolution for unknown/terminal stale interactions, and distinguish verified process cleanup from uncertainty. 4. Fix common secret patterns, bound serialized log/message payloads with a truncation event, expire known credential values, and recover terminal interaction metadata safely. 5. Cover the reproduced failures with meaningful tests, run RAC and existing server/client regressions where supported, build/type/lint, document exact delivery boundaries and commit the scoped fixes locally. Keep original history-by-ID and documented HMR policy.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented compatibility/security, cache/error, project-ID/Git, human resolve, denial-selection, serialized truncation/redaction, expiring credential protection and old terminal interaction fixes. Existing WebSocket tests now provide the same Origin as browser clients, without weakening server checks. Initial real Terminal regression: 446 pass /6 fail; the residual five Origin-less WS clients and one decision PUT without Content-Type were corrected. Final external rerun is pending. Native CLI builds; types/lint and scoped regression tests pass. Restricted-session descendant process probes can return EPERM; retain fail-closed cleanup and rely on the real Terminal process tests, which passed in the first external run. BACK-795 reopened with AC6 unchecked; no launchd job was installed or claimed verified. Preserve its unrelated user ordinal1000 outside the commit.

Checkpoint validation: 130 pass /0 fail /505 assertions across14 scoped files; types pass593 files; Biome passes529 files; official native CLI build succeeds (version1.55.3 and resolve help). The first external full suite remains446 pass /6 fail; residual WS-Origin and untyped-decision cases have since been fixed and covered locally. Await the final full external HTTP/WS rerun before checking AC1 or marking Done. Human resolve, canonical prefix/Git behavior, sanitized serialized payloads and expiring credentials, terminal request retirement and fail-closed route registration have targeted passing evidence. This checkpoint is a local commit only; no push.
<!-- SECTION:NOTES:END -->
