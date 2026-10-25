# PR #1 review corrections (BACK-818)

The user authorized fixes after verifying the review against `3520d8b6`.
This is corrective work on the delivered foundation, not RAC-09 or a new UI.

| Finding | Delivered correction |
| --- | --- |
| Existing API clients rejected without Origin | Preserve non-browser local clients; validate every supplied Origin, require Origin for browser/RAC mutations and all WS/SSE, retain exact Host checks. A lone Sec-Fetch-Mode header is not treated as browser identity. |
| Dashboard text editor/bodyless actions rejected | Preserve decision PUT plain text/Markdown and legacy absent Content-Type; ordinary bodyless actions need no JSON header. Other payloads and all RAC mutations retain JSON checks. |
| Cross-site links rejected | Permit top-level navigation to SPA document routes, while rejecting foreign fetches, mutations and asset navigation. |
| Handler exceptions and cache changed | Use the original logged 500 path for ordinary exceptions. Keep HTML/API no-store, hashed bundle assets immutable and project asset cache behavior unchanged. |
| Unknown slot cannot be released | Add authenticated, idempotent CLI/API resolve with explicit human process-stop confirmation. Never kill an unverified PID or auto-resume; block resolution during owned startup/execution/cleanup. |
| Known stopped group recorded as unknown | Record interrupted when cleanup proves the owned group stopped, including disable, thread timeout and shutdown during thread startup. Keep unknown on unverified cleanup or unavailable persistence. |
| Invalid automatic decline | Select an offered decline/cancel decision; if no safe denial exists, close rather than send an invalid or accepting answer. |
| Numeric IDs and non-Git projects | Resolve bare IDs with the configured project prefix; require fully qualified IDs at the internal store boundary. Git is optional; an actual Git operation is still checked independently of repository filesystem-only configuration. |
| Common secrets persisted | Redact prefixed environment assignments, credential URIs beyond HTTP, and PEM/PGP private keys before SQLite writes. This does not rewrite old databases/backups. |
| JSON expansion causes unknown | Redact full text first, fit it to the serialized JSON budget, record a truncation marker and preserve subsequent bounded logs. |
| Old terminal interactions cannot be retired | Recover open requests as uncertain across all run states. Human resolution can stale old terminal requests without changing their outcome or clearing a later turn in the same session. |
| Secret registry grows forever | Expire pairing/session values with their credential lifetimes; retain configured/owner credentials. Bound the registry and prune expired values without an owner restart. |
| Future route shapes bypass checks | Guard function, response, HTML and method-map routes. Reject unsupported registrations before listening. |
| RAC-06 launchd evidence overstated | Reopen BACK-795 and uncheck AC6. Actual launchd execution remains unverified; no service was installed by these corrections. |

History across reused task IDs remains intentional: records carry taskCreatedAt
and the store supports filtering by it. The future UI must distinguish old task
identities. Adapter/store methods required by delivered contracts and upcoming
tasks remain in place. Native HMR remains explicitly disabled on the guarded
listener. Single-backup migration policy is unchanged.

Resolve was brought forward from RAC-10 to make the current execution surface
recoverable. RAC-10 remains pending for cancel/resume and its other lifecycle work.
No answer/decide interface or remote dashboard exposure is enabled.

Tests cover the reproduced paths, native route callbacks, the three dashboard
actions, CLI/API resolution, unverified cleanup, startup races, secret formats,
JSON expansion, credential expiry and terminal-interaction recovery. The existing
WebSocket clients in server tests now explicitly send the browser Origin; the
server's missing/foreign Origin rejection remains tested.

The first real Terminal run passed 446 tests and exposed six residual cases:
five native WebSocket clients missing Origin and one legacy untyped decision PUT.
Those cases were corrected; final full-server rerun is required before closing
BACK-818. Restricted-session process-group probes can fail with EPERM; they are
not treated as proof of missing groups or bypassed to obtain a green result.
