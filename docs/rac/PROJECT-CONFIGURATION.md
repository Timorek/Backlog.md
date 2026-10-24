# RAC project configuration (RAC-05)

The canonical local commands are `backlog rac enable` and `backlog rac disable`.
They apply to the project selected by the existing CLI project resolver. Both
use fresh system authentication by default. The explicit local
`--skip-system-auth` flag skips that step, as requested by the user; it does not
elevate OS privileges. There is no `--yes` or web configuration equivalent.
RAC remains disabled by default. Enabling records local configuration;
there is no RAC execution endpoint or agent process yet.

## Project identity and workspace

`src/rac/project-context.ts` resolves an existing absolute directory with
`realpath`, hashes the resulting path with SHA-256 and returns `canonicalRoot`
and `projectKey`. Relative paths, NUL bytes and traversal segments are rejected.
A root symlink alias has the same identity as its target; moving a checkout gives
it a new identity. There is no relinking or multi-project registry.

Internal workspace path validation requires an existing absolute path beneath
that configured root, checking both lexical containment and its `realpath`.
Symlinks escaping the workspace and sibling directory name prefixes are rejected.
This helper does not authorize arbitrary paths supplied by HTTP clients and
does not provide filesystem sandboxing or race-free file access.

`validateRacContext` accepts enabled settings, a trusted owner descriptor and an
already authenticated session record. It checks their root, project key and
owner generation, revalidates the root identity and returns only the configured
root as the future execution cwd. The caller must obtain the session from its
server-side authentication store and the owner from actual ownership, rather
than deserializing either from a request. HTTP authentication, descriptor
authentication, lock acquisition and handler wiring belong to subsequent tasks.

The actual backend exposes `BacklogServer.authorizeRacWorkspace(owner, session)`
as the shared guard for future RAC handlers. It loads local settings on every
call using only the root held by the existing `Core` instance. Disabling RAC
therefore takes effect on the next authorization without a backend restart.
No request body or client path is accepted by this method. Its optional data
directory is trusted server-construction input, not a browser parameter.

Session authentication and actual lock ownership must be established by the
caller before invoking this guard. Matching record fields alone do not prove
either. RAC-05 verifies the root/identity boundary inside the backend; RAC-07/08
must provide real ownership and authenticated request handling before any
execution route is exposed.

## Local settings

`src/rac/project-settings.ts` reads `settings.json` below the OS-specific data
directory specified in ADR D2. The exact schema has four fields:

```json
{
  "schemaVersion": 1,
  "canonicalRoot": "/absolute/canonical/project",
  "projectKey": "sha256-of-canonical-root",
  "enabled": false
}
```

The loader receives the backend's selected project root, never a client-selected
cwd. It validates the stored identity against that root. Missing settings mean
disabled and do not create files. Malformed JSON, unknown fields, a different
schema or mismatched identity fail closed. Repository configuration is not read.
Neither `backlog/config.yml` nor the existing config API enables RAC. The writer
authenticates before creating or modifying settings unless the local caller
explicitly supplies `--skip-system-auth`. It revalidates the project and
data location before writing, then replaces the file using a private
temporary file, file sync and atomic rename. Corrupt existing settings are not
overwritten. Concurrent changes use the last completed write.

The dedicated data root must be outside the checkout and cannot be its ancestor.
Symlinked data roots, per-project directories and settings files are rejected.
On POSIX the RAC data and project directories must be owned by the current user
with no group/other access; the settings file must additionally be a regular
file with one hard link and no group/other access. Reads reject files larger
than 16 KiB. Windows settings access fails closed until equivalent ACL checks
are implemented and verified; portable path defaults alone do not establish
Windows support.

These permissions isolate other OS users. They do not isolate a process running
as the same user with unrestricted host access. The agent sandbox must deny
writes to the external settings and trusted executable. Outside-workspace read
and credential isolation remain separate security gates documented in RAC-03.

## Approved local authorization

The user approved macOS LocalAuthentication with a fresh `LAContext`,
`deviceOwnerAuthentication` and zero Touch ID reuse duration for each local
enable/disable operation by default. The system handles Touch ID, Apple Watch or the user
password; the CLI does not collect passwords. Denial, cancellation, missing
native tooling or unsupported platforms leave settings unchanged. No
`--yes`, TTY detection, environment variable or browser request may bypass the
authorization. This decision was explicitly reviewed under task-execution step 7.

The user subsequently authorized an explicit exception:

```bash
backlog rac enable --skip-system-auth
backlog rac disable --skip-system-auth
```

This local CLI option never invokes Swift or prompts for a password. It changes
only the human-authentication step, retaining canonical project/path validation,
external settings permissions and atomic writes. It is not stored in project
settings or accepted from the repository config or a web request. The name does
not imply administrator privileges: any process able to write the settings can
use it, including an agent with those filesystem permissions. Human presence is
therefore no longer an unconditional guarantee of enablement. Agent write
isolation remains necessary. The option does not implement Windows ACL support,
HTTP authorization or agent-operation approval bypasses.

`src/rac/local-authorization.ts` embeds the fixed Swift helper in the Bun CLI
bundle. It runs `/usr/bin/swift` from a private temporary directory with a private
module cache and a minimal environment, without inheriting repository paths or
library injection variables. Arguments carry the action and canonical root;
they are not interpolated into Swift or shell source. macOS Apple Command Line
Tools are required (`xcode-select --install` if absent). The first invocation may
take time to compile system modules. A 180-second timeout fails closed and the
temporary source/cache are removed afterwards. There is no persistent helper
binary to install. Native authorization on other OSes remains unsupported.

The internal writer accepts an authorizer dependency for tests. This is not a
public SDK or an authorization capability; the production command uses
the system authorizer unless the explicit local skip flag is present.
Trusted host code and the external data directory must
remain outside the executing agent's write permissions. This mechanism does
not protect against arbitrary processes with unrestricted same-user host access.

Future execution handlers must reload settings before authorizing a mutation;
a cached enabled flag is not an ongoing authorization. Revoking permission for
an already running agent requires the lifecycle policy in later RAC tasks.

Apple documents [device owner authentication](https://developer.apple.com/documentation/LocalAuthentication/LAPolicy/deviceOwnerAuthentication)
and [Touch ID reuse](https://developer.apple.com/documentation/localauthentication/lacontext/touchidauthenticationallowablereuseduration).
The native helper is type-checked with the installed macOS SDK. Unit tests inject
an authorizer and do not establish that a real person completed the system UI.

## Verification so far

The project/context and settings tests cover canonical identity, moved checkouts,
invalid and relative paths, escaping symlinks, missing or malformed settings,
private filesystem permissions, denied authorization without writes, successful
enable/disable round trips, root changes during authorization and mismatched
session/owner bindings. CLI tests cover help, project resolution and rejection of
unsupported/path options and parsing of the explicit skip flag. Tests also
verify password-free enable/disable and unchanged validation in skip mode.
These are shared model tests, not proof of HTTP
authentication or native human presence.

`server-rac-workspace.test.ts` also exercises the real backend method without
opening sockets: fresh enable/disable reads, missing/mismatched sessions and
owners, stale generation, ignored request-like path fields, a second project,
root symlink replacement and escaping workspace paths. A direct test of the
existing config API proves that repository config updates cannot enable RAC or
apply the local CLI skip flag.

The restricted development session successfully type-checked the helper against
the installed SDK, but a real authorization attempt stopped at
`canEvaluatePolicy` with "System authentication is unavailable". The helper
exited unsuccessfully and no configuration write was attempted. The user then
observed and cancelled the native dialog, and subsequently entered a password.
The actual local settings were read afterwards and showed `enabled: true` for
this checkout, verifying successful enablement. This does not establish HTTP
authentication or complete subsequent backend integration tasks.
