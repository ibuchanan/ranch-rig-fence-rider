# Variable compatibility contract

Status: Single-file deployment implemented and locally verified on
2026-10-19. Authorized live Forge verification is blocked. The
[deployment evidence](deployment.md) separates native SecretSpec checks,
controlled Forge behavior, and unverified upstream acceptance.

This reference defines variable declarations, local availability, manifest
checks, and runtime upload selection for deployment. Configured lint reuses
full-profile validation, local delivery, and the optional manifest check,
without uploads or injected target flags; its [output boundary](#configured-lint)
differs from private deployment output.
The repository-owned `secretspec.toml` specifies and validates every variable.
There is no separate Fence Rider variable inventory or provider schema.

The conceptual distinction between these destinations is covered in
[Why Forge has three kinds of environment variables][explanation].

## Evidence status

| Boundary | Baseline | Evidence | Remaining verification |
| --- | --- | --- | --- |
| SecretSpec | 0.21.1 | Native schema/full dotenv export through compiled CLI, profile inheritance, optional/empty values, validation failures | Other providers, versions, and cross-file specifications |
| Forge CLI | 14.2.0 | Previously inspected help/source and official reference; controlled subprocess delegation | Live encryption, server-side value acceptance, target identity, deployment activation |
| Project tooling | Bun 1.4.3 on macOS | Compiled CLI, TOML/YAML parsing, public tests, POSIX interruption | Other runtimes and operating systems |

These are exact evidence baselines, not a tested version range. Native
SecretSpec checks ran with synthetic values and dotenv only. Controlled
Forge executables establish wrapper behavior, not upstream compatibility.
No live Forge variables or deployments have been changed. The user chose
to record live verification as blocked rather than authorize a destination.

## Declaration ownership

| Concern | Authority |
| --- | --- |
| Variable names, descriptions, requirements, and defaults | Native SecretSpec profile declarations |
| Active profile and provider resolution | SecretSpec configuration and CLI |
| Provider authentication and fallback | SecretSpec and the selected provider |
| Local availability | Full active-profile resolution; no named scope required |
| Optional manifest consistency check | Native SecretSpec `manifest` scope compared with Forge declarations |
| Remote upload selection | Native SecretSpec `runtime` scope |
| Control-value checks and orchestration | Fence Rider |
| Manifest substitution and its validation | Forge CLI |
| Encrypted remote storage and runtime activation | Forge |

All three variable categories use SecretSpec declarations and validation.
A local control or manifest input is not exempt because it is not uploaded.
A public repository declaration contains no secret values; non-sensitive
literal defaults may be declared using native SecretSpec syntax.

Provider credentials remain under SecretSpec's provider configuration and
existing authentication. They are not exported application variables merely
because SecretSpec uses them during resolution. A credential explicitly
declared as an application variable receives ordinary declaration treatment.

## Local availability and scope policy

| Selection | Local behavior | Additional Fence Rider behavior |
| --- | --- | --- |
| No named scope membership | Resolved and validated with the full active profile; available to local tooling | No upload authorization; no manifest cross-check membership |
| `manifest` membership | Same local availability | Checks that the member is declared in Forge's `environment.variables` |
| `runtime` membership | Same local availability | Uploads the member encrypted to the selected Forge environment |
| Membership in both scopes | One resolved value available locally | Manifest declaration check and encrypted runtime upload |

Local availability is implicit. Fence Rider does not require a `local`
scope, and unscoped declarations are valid local configuration. Other native
scopes may exist for other tools; membership in them has no special meaning
for Fence Rider's upload or manifest checks.

The full resolved application environment is available to the delegated
Forge processes. The `manifest` scope is not an environment injection
allowlist, and runtime membership does not remove a value from local use.
Local availability does not imply that a value becomes an app runtime
variable. Only explicit `runtime` membership authorizes that upload.

A variable outside both recognized scopes is local-only under Fence Rider's
routing policy. It may still be consumed by a Forge manifest substitution
when Forge's own declaration permits it; the optional SecretSpec metadata
check does not control what the Forge parser can read.

The `runtime` name replaces the exploration's logical `forge_upload` name.
Upload selection is never inferred from a prefix, an environment file,
process environment contents, or the Forge manifest. Omitting a variable
from `runtime` means Fence Rider does not upload it. It does not remove any
value already stored remotely.

### Optional manifest check

When a `manifest` scope is present, its effective active-profile members
must appear in the Forge manifest's `environment.variables`. Both native
string entries and objects with a `key` are declarations for this check.
A missing declaration fails before remote writes. The check does not demand
that every Forge manifest variable also appear in the SecretSpec scope,
and it does not require every scope member to be used in a substitution.

An omitted `manifest` scope skips this additional cross-check. It does not
skip SecretSpec validation, remove local values, or prevent substitution.
Forge remains responsible for validating actual substitutions and its own
manifest declarations. Forge lint does not know about SecretSpec scopes:
a missing SecretSpec `manifest` scope alone is not a Forge lint failure.
A manifest default or a supplied local value may make substitution valid.

This metadata check is not a second definition of requiredness or a custom
replacement for Forge lint. Fence Rider does not silently rewrite the
manifest or claim that this check proves the whole manifest valid.

### No runtime uploads

A `runtime` scope absent from the effective merged specification means no
uploads. Root-file omission does not erase an inherited scope. A valid scope
whose intersection with the active profile has no members also means no
uploads.
The deployment can continue after full-profile validation and any applicable
manifest check. Neither case deletes or resets existing remote variables.

The literal native declaration `secrets = []` is invalid under the documented
SecretSpec schema. A project with no runtime variables omits that scope; it
does not need a dummy variable or another configuration file. Unknown scopes
explicitly requested from SecretSpec remain errors, not upload-all fallbacks.

### Native scope semantics

SecretSpec documents the following behavior:

- Scopes are top-level named tables containing a `secrets` allowlist.
- A scope contains at least one name, with no blank or repeated entries.
- Every member is declared in at least one profile. Membership need not
  exist in every active profile.
- The selected set is the intersection of the scope and merged active
  profile. A valid scope may have an empty intersection with that profile.
- Profiles retain ownership of requirements, defaults, provider resolution,
  and storage addresses. A scope does not create another copy of a value.
- A required declaration outside a selected scope does not block that scoped
  resolution. Fence Rider therefore must not use a runtime-only resolution
  as validation of the full deployment configuration.
- An explicitly blank CLI scope clears an inherited scope; it does not mean
  an empty selection. Ambient scope settings must not narrow Fence Rider's
  full-profile validation or local environment.

### Declaration shape

The following excerpt illustrates implicit local configuration and optional
scope metadata. It is not an executed compatibility fixture and contains no
provider configuration or secret values.

```toml
[project]
name = "sample-forge-app"
revision = "1.0"

[profiles.default]
FORGE_ENV = { description = "Forge environment", default = "development" }
SERVICE_URL = { description = "External service URL", required = true }
API_KEY = { description = "External service credential", required = true }

[scopes.manifest]
secrets = ["SERVICE_URL"]

[scopes.runtime]
secrets = ["SERVICE_URL", "API_KEY"]
```

`FORGE_ENV` needs no scope. `SERVICE_URL` is both a checked manifest input
and a remote runtime variable. `API_KEY` is also locally available, but only
runtime membership authorizes its upload. Omitting `manifest` would not
prevent the local `SERVICE_URL` from supplying a Forge substitution.

## Profiles and Forge targets

A SecretSpec profile and a Forge environment are distinct identifiers.
Selecting a profile does not automatically select a same-named environment.

| Local control | Meaning | Deployment treatment |
| --- | --- | --- |
| `FORGE_ENVIRONMENT` | Canonical configured Forge environment | Used after an explicit CLI environment option and before the `development` fallback |
| `FORGE_ENV` | Legacy environment alias | Accepted alone or with a matching resolved `FORGE_ENVIRONMENT` |
| `FORGE_SITE` | Site default for future supported commands | Validated when declared; not injected as an unsupported deployment option |
| `FORGE_PRODUCT` | Product default for future supported commands | Validated when declared; not injected as an unsupported deployment option |

These controls need no named scope. Selecting any of them for runtime upload
fails before the first write, including both environment names. Defaults are
native SecretSpec declaration fields, not a second configuration format.

`FORGE_ENVIRONMENT` is canonical; `FORGE_ENV` remains supported for existing
specifications. Either name alone works. When both resolve, their strings must
match exactly. Conflicting resolved names fail before any Forge command, even
with an explicit environment option. There is no alias migration precedence.
Absent optional controls do not conflict with present values or retain stale
inherited values. Existing examples using `FORGE_ENV` remain valid.

Validation covers the whole active profile, not only the command's selected
values. Required declarations remain subject to SecretSpec validation even
when a CLI option supplies the final target; an optional declaration or native
default represents legitimate absence. SecretSpec 0.21.1 synthetic dotenv checks
confirm that a missing required `FORGE_ENVIRONMENT` still blocks an explicit
`-e production` invocation before Forge execution.

Uploads and deployment use one resolved Forge target explicitly. Site and
product defaults do not make installation a supported Fence Rider command.

## Resolution and validation boundary

The deployment boundary has these invariants:

- All application variables are resolved and validated from the full merged
  active profile before any upload. Unscoped requirements participate, even
  when both recognized scopes are omitted.
- Each declared value is resolved once for the operation and reused in the
  local process environment and any runtime upload. Independent scoped
  resolutions must not supply inconsistent copies of the same variable.
  One resolution pass is not a vault-wide atomic snapshot.
- Native SecretSpec checks handle supported declaration constraints.
  Fence Rider checks control values, applicable manifest declarations,
  process-safe input, and verified Forge runtime naming/value restrictions.
- An absent optional value is omitted. An explicit empty string remains
  distinct from absence; its acceptance requires verified destination
  behavior. Structured values are not silently stringified, and string
  values such as `"0"` and `"false"` are not discarded by truthiness checks.
- No SecretSpec-resolved values are printed or persisted in a Fence Rider
  cache or temporary file. Local availability includes delegated tooling,
  not logs or automatically generated artifacts.

The implemented boundary uses Bun's TOML parser for single-file metadata,
native profile schema, and one full export, as specified below. Native
SecretSpec 0.21.1 integration checks verify this combined flow. JSON export
returns values, not membership; schema returns effective names, types, and
requiredness, not scope lists. Fence Rider intersects the file's scope lists
with those native names without resolving a second time.

The documented `secretspec.resolver/1` protocol resolves exact names through
`resolver.get`. It explicitly excludes whole-profile resolution and arbitrary
manifest queries. It is not a verified solution for obtaining memberships
alongside a full-profile result.

### JavaScript SDK surface

The published `secretspec@0.21.1` package's complete `index.d.ts` and
JavaScript wrapper were inspected without installation or execution.

| Public surface | Available information | Missing information |
| --- | --- | --- |
| `Builder.withScope(name)` | Chooses one scope for resolution | Available scopes and membership |
| `Builder.load()` / `loadAsync()` | Resolved fields, active profile, selected scope, missing optional names | Effective configuration and scope memberships |
| `Builder.report()` / `reportAsync()` | Resolution statuses, requiredness, provenance, selected scope | Scope enumeration or a configuration-only report |
| `Builder.withNoValues()` | Omits usable values from resolution results | No guarantee of avoiding provider I/O; not a metadata reader |
| `Builder.withInlineSpec()` | Accepts a caller-supplied specification | Does not read or expose effective TOML configuration |

`Resolved` and `Report` retain only the selected `scope` string or null.
Their constructors do not expose a map of scopes or merged declarations.
The public exports contain no effective-configuration or scope-list method.
The builder dispatches native resolution/report operations; its public
surface does not close the scope metadata gap.

The SDK embeds a platform-specific native addon rather than wrapping the
installed CLI. Its source confirms that `setAsEnv()` skips null values but
does not clear pre-existing environment entries. `as_path` values refer to
secret-bearing temporary files with caller-owned disposal. Those behaviors
require separate compatibility decisions if the SDK is adopted; this source
inspection does not prove Bun/native-addon runtime compatibility.

No dependency was added and no SDK resolution was executed. These findings
apply to 0.21.1, not every later SDK version.

### Source-backed scope composition

The SecretSpec 0.21.1 configuration loader and regression tests establish
these rules. This is source inspection, not execution of the upstream tests.

| Concern | Upstream behavior |
| --- | --- |
| Scope placement | Top-level global name lists, not per-profile settings |
| Scope conflict | A later document replaces the whole same-named scope; lists are not concatenated |
| Scope omission | Earlier inherited definitions remain in effect |
| Effective membership | Merged scope names intersect with the effective active profile's declarations |
| Validation | Members must exist in at least one compiled profile; empty, duplicate, and blank members are rejected |
| Default profile inheritance | Changes profile declarations, not scope lists; SecretSpec owns this behavior |

`project.extends` is traversed depth-first in listed order. Each document is
emitted after its ancestors; overlays then run from least to most specific,
with the root last. Shared ancestors are emitted once by canonical path.
A path on the active traversal stack is a cycle and fails. Later parent
branches therefore override earlier emitted definitions, and the root wins
same-name conflicts.

Paths ending in `.toml` designate files; other entries designate directories
containing `secretspec.toml`. Relative paths are resolved from the referring
file's lexical location, including a symlink's location. Canonical paths
are used for cycle detection and deduplication, not as the relative-path
base. Missing files and unsupported revisions fail rather than disappear.

Consequently, an omitted runtime scope means no uploads only when it is
absent from the effective merged specification. Omitting it from the root
alone does not disable an inherited runtime scope. No disable/delete marker
was found in the inspected scope overlay implementation.

### Initial single-file support

The first implementation supports one repository-owned `secretspec.toml`.
Cross-file specification inheritance through non-empty `project.extends` is
unsupported and fails before secret resolution or any Forge interaction.
The diagnostic identifies the unsupported feature without printing values.
An omitted `extends` or an empty array introduces no inheritance and is
accepted, subject to native SecretSpec validation. Malformed declarations
fail rather than being treated as absent.

Native profile inheritance within that file remains supported and is owned
by SecretSpec. The restriction does not prohibit multiple profiles or
ordinary provider configuration; it prohibits loading additional variable
specification files. The upstream composition rules above are background
for a deferred feature, not requirements to build a graph reader now.

The approved metadata boundary is:

- Parse the single TOML document with Bun's TOML parser and reject unsupported
  cross-file inheritance. No additional parser dependency is needed.
- Read the optional `manifest` and `runtime` scope lists directly from that
  document. Missing runtime scope means no uploads; no inherited scope can
  be silently overlooked because non-empty `extends` is rejected.
- Obtain effective active-profile declaration names from SecretSpec's
  value-free `schema --profile` interface. Do not reimplement profile merging.
- Intersect scope members with those names for manifest checks, including
  optional declarations absent from exported values.
- Resolve values once through a full-profile JSON export and select runtime
  uploads from that result. Scope metadata never requires a second provider
  resolution. Schema and export use the same file and explicit profile.

SecretSpec continues to own declaration validation, profile inheritance,
provider behavior, and resolution. No custom graph traversal, parent overlays,
cycle detection, or cross-file caching is part of this release.

Required checks cover omitted and empty `extends`, non-empty and malformed
`extends` rejection before resolution, native default-profile inheritance
and its opt-out, omitted scopes, and an optional member absent from exported
values. These checks pass through the compiled CLI, including native
SecretSpec integration. Future cross-file support requires a separate
contract change and upstream metadata support or a fully tested graph reader.

The child environment retains ordinary process settings and existing
authentication. Declared names are first removed from the inherited
environment, then resolved values are assigned. Native tests confirm absent
optionals cannot retain stale ambient values. Provider-private state is not
gathered or exported automatically; ambient credentials remain inherited,
not isolated. Required-resolution failures stop before Forge runs.

## Upstream command interfaces

| Interface | Observed or documented behavior |
| --- | --- |
| `secretspec export --format json` | Resolves values as a name-to-value JSON object; documented as non-interactive with failure on missing required values |
| `secretspec export --scope NAME --format json` | Emits only the selected scope/profile intersection; does not unset inherited process values |
| `secretspec check --json` | Produces a value-free resolution report, never prompts, and fails on missing required values |
| `secretspec run -- COMMAND` | Makes resolved profile values available in a child process environment |
| `secretspec run --scope NAME -- COMMAND` | Narrows resolution and removes excluded declared variables from the child environment; not full-profile validation |
| `secretspec serve --read-only` | Exposes a private child resolver protocol; availability does not establish that Fence Rider needs it |
| `forge variables set --encrypt --environment ENV KEY VALUE` | Sets an encrypted remote variable for the app and environment |
| `forge deploy --environment ENV` | Deploys the app to the selected environment; supports non-interactive operation |

The exploration's `secretspec load` is not an observed command in 0.21.1.
Ordinary `secretspec check` may prompt or set missing values. A separate check
followed by export is not evidence of a single coherent resolution.

## Forge boundaries and failures

Forge reads manifest substitutions from its process environment; referenced
variables also need Forge's `environment.variables` declaration. This does
not make them runtime environment entries. A manifest field may expose its
value through app behavior, so local or manifest does not mean non-secret.

Runtime updates take effect after deployment to the same app/environment.
Encryption occurs on Atlassian's servers after receipt, not as a guarantee
of secrecy from the platform or local process inspection. Inspected CLI help
accepts positional values; a non-interactive stdin interface is unverified.
Fence Rider rejects empty and leading-dash runtime values before all uploads.
Native tests preserve local empty strings and strings `"0"` and `"false"`;
controlled tests preserve multiline and special characters as one argument.
Forge server-side value acceptance remains unverified.

SecretSpec validation or an applicable manifest metadata mismatch prevents
all uploads. This does not establish that Forge's complete lint pipeline
has run before uploads; broader Forge validation may still fail later.
An upload failure stops later uploads and deployment; earlier uploads may
already have changed remote state. There is no automatic rollback.

Diagnostics omit resolved values, raw helper output, and secret-bearing
command lines. Numeric deployment exit status is preserved; launch failure,
signal termination, or interruption cannot become success.

## Configured lint

`fence-rider lint [Forge options]` resolves and validates the entire active
profile once, delivers every resolved application value to `forge lint`, and
applies the optional manifest check. A required local, manifest, runtime, or
control value can block lint even when lint does not use it: this is
whole-profile repository readiness, not command-scoped requiredness. Native
optional declarations and profiles represent legitimate absence.

No environment/site/product flags are injected. Explicit lint arguments,
including Forge's environment option, retain their boundaries and order; Forge
owns their validation. Runtime scope membership causes no upload, deployment,
installation, deletion, or other follow-up command. Controls-only profiles
work without dummy application secrets. Omitted manifest metadata does not
suppress local delivery or Forge's substitution requirements.

### Output and input policy

SecretSpec schema/export and encrypted-upload stdout remain private and stderr
is discarded. Deployment retains its existing suppressed-output contract.
Delegated user-facing lint and installation inherit stdin, stdout, and stderr:
output is live, without redaction, and on its original stream; input is available
without wrapper prompts. Wrapper-owned diagnostics omit values and raw helper
errors. **Forge output, exception details, application logs, echoed input, and
terminal sessions may expose values**; Fence Rider provides no passthrough
redaction or credential isolation. Existing ambient authentication is retained.

This shared user-facing stdio mode serves lint and installation; it does not
implement uninstall or tunnel, or certify terminal-specific prompt behavior.
Ordinary pipe checks establish input and pre-exit streaming.
POSIX interruption forwards SIGINT/SIGTERM to the active process group, escalates
after one second, and kills remaining group members, including when the direct
child exits first. Windows process-tree cleanup remains uncertified.

Numeric Forge lint statuses are preserved. Resolution, validation, launch,
signal termination, and interruption are non-success; operator interruption
returns 130/143. Help (`lint --help`, `lint -h`, `help lint`) does not resolve
configuration or run tools. Help-looking option values and terminator payloads
are not discovery requests.

Observed 2026-10-19: installed Forge CLI 14.2.0 `lint --help` lists `--verbose`,
`--fix`, `--approve <rule...>`, `-e, --environment [environment]`, and help.
Inspection used Bun 1.4.3; Forge warned it supports Node.js 22.x or 24.x, so this
is interface evidence, not runtime certification. Native SecretSpec 0.21.1
synthetic dotenv tests cover missing runtime/manifest requirements, explicit
file/profile with native inheritance, shared manifest inputs, stale optional
cleanup despite ambient scope, and controls-only profiles. Controlled Forge
checks establish delegation, not real Forge lint or manifest substitution.
No live app was contacted. See the [validation record](validation.md).

## Configured installation

`fence-rider install [Forge options]` resolves the whole active profile once
and delegates exactly one installation with inherited application values,
ordinary settings, and existing authentication. It performs no runtime upload,
remote deletion, deployment, or optional manifest declaration cross-check.
Controls-only profiles work. Installation does not activate changed runtime
values. SecretSpec requiredness and environment-alias conflicts still apply
with explicit target overrides.

| Target | Selection order | Validation |
| --- | --- | --- |
| Environment | Explicit option, resolved `FORGE_ENVIRONMENT` / `FORGE_ENV`, `development` | Alphanumeric first character, then alphanumeric, underscore, or hyphen |
| Site | Explicit option, resolved `FORGE_SITE`; no fallback | Nonempty HTTP(S) URL or hostname, without whitespace, controls, or credentials |
| Product | Explicit option, resolved `FORGE_PRODUCT`; no fallback | Case-insensitive Jira, Confluence, Compass, or Bitbucket |

Target switches accept separated long/short forms, long equals forms, and
attached short values: `--site URL`, `-s URL`, `--site=URL`, `-sURL`, and the
corresponding `--product`/`-p` and `--environment`/`-e` forms. Short equals forms
such as `-p=jira` are invalid. Missing, empty, invalid, or repeated targets fail
before Forge; explicit target syntax errors fail before SecretSpec too.
Missing effective site/product never opens Forge's target selection prompts.
Bitbucket uses a workspace URL such as `https://bitbucket.org/workspace/`.
`--demo-site` / `-d` is unsupported because it conflicts with configured site
selection. Feature-gated Teamwork Graph installation is not certified here.

Upgrade is the same command with an explicit `--upgrade [all|code]` or `-u`
option. Fence Rider adds no upgrade, consent, non-interactive, license, or
approval policy. `--confirm-scopes`, `--non-interactive`, optional license
values, and variadic license/user options retain order and boundaries.
Required values for `--app-id-override`, `--major-version`, and `--unitId`
consume even switch-looking payloads; attached/equals payloads and everything
after `--` are preserved. The wrapper does not implement a universal parser
for future Forge options.

Forge input/output uses the [live output policy](#output-and-input-policy).
Numeric failures propagate; private helpers stay suppressed. Help aliases
`install --help`, `install -h`, and `help install` need no configuration or
external tools. Help-looking required values and terminator payloads are not
help requests. POSIX interruption uses the existing bounded process-group
cleanup; Windows and real terminal-specific prompt behavior remain unverified.

Observed 2026-10-19: installed Forge CLI 14.2.0 `install --help`, published
14.2.0 installation registration/context parsing source, and `@forge/cli-shared`
9.8.0 supported-products source establish these option value counts and products.
Upstream product matching is case-insensitive; site parsing accepts URLs with
or without a scheme. Source inspection and controlled subprocesses are not
live site acceptance. Inspection through Bun 1.4.3 emitted Forge's Node.js
22.x/24.x support warning. Native SecretSpec 0.21.1 dotenv checks establish
configuration behavior only. No live installation, consent, upgrade, app
registration, or cleanup was authorized or executed. See the
[validation record](validation.md) and [consumer procedure][install-guide].

[install-guide]: ../how-to/how-to.md#install-or-upgrade-the-configured-app

## Verification ownership

Contract decisions are recorded in ticket 01. Its completion does not depend
on further executable proofs and does not certify upstream compatibility.
The deployment implementation in ticket 03 verifies the native schema/export
path with synthetic values and controlled Forge tooling. Ticket 05 extends
those checks for native inheritance, optional and empty values, inherited
environments, and invalid inputs. Ticket 04 verifies option handling, and
ticket 06 verifies failure behavior.

Ticket 07 reuses implementation checks and owns explicitly authorized live
Forge validation and supported-version reporting. Existing exploratory
checks are optional supporting evidence, not prerequisites. If observed
behavior conflicts with a contract rule, that specific rule returns for
review; unresolved evidence does not create a separate proof-work phase.

## Compatibility verification status

The [acceptance map and command outcomes](validation.md) record the executable
checks rather than treating the initial contract as proof.

| Boundary | Current result |
| --- | --- |
| Scope metadata and full resolution | Passing native schema/full export with effective scope intersections |
| Implicit local validation and environment | Passing unscoped requirement, stale optional, and shared-value checks |
| Optional manifest scope | Passing omitted, present/missing, string, and keyed-object declaration checks; real Forge substitution not executed |
| Runtime absence and value semantics | Passing no-write/no-delete, optional, empty, string-zero/false, malformed-output cases |
| Provider configuration | Passing synthetic dotenv resolution only; no fallback or general provider promise |
| Forge input boundary | Positional argument boundaries and fail-closed restrictions tested locally; server acceptance and safer input mechanisms unverified |
| Live Forge behavior | Blocked: no authorized disposable app/environment, writes, deployment, or cleanup |

Uninstall and tunneling remain unsupported by Fence Rider pending their
own contracts. Local availability does not imply a general command runner.

## Sources

- [SecretSpec scopes][scopes]
- [SecretSpec configuration reference][configuration]
- [SecretSpec CLI reference][cli]
- [SecretSpec resolver protocol][resolver]
- [SecretSpec JavaScript SDK][sdk]
- [Published SDK 0.21.1 metadata][sdk-package]
- [Published SDK 0.21.1 archive][sdk-archive]
- [SecretSpec 0.21.1 configuration loader and scope tests][config-source]
- [SecretSpec 0.21.1 profile/scope intersection][membership-source]
- [SecretSpec 0.21.1 schema profile interface][spec-source]
- [SecretSpec dotenv provider][dotenv]
- [Forge manifest environment variables][manifest]
- [Forge variables set][variables]
- [Forge environments][environments]

[explanation]: ../explanation/explanation.md
[scopes]: https://secretspec.dev/concepts/scopes/
[configuration]: https://secretspec.dev/reference/configuration/
[cli]: https://secretspec.dev/reference/cli/
[resolver]: https://secretspec.dev/reference/resolver-protocol/
[sdk]: https://secretspec.dev/sdk/nodejs/
[sdk-package]: https://registry.npmjs.org/secretspec/0.21.1
[sdk-archive]: https://registry.npmjs.org/secretspec/-/secretspec-0.21.1.tgz
[config-source]: https://github.com/cachix/secretspec/blob/v0.21.1/secretspec/src/config.rs
[membership-source]: https://github.com/cachix/secretspec/blob/v0.21.1/secretspec/src/secrets.rs
[spec-source]: https://github.com/cachix/secretspec/blob/v0.21.1/secretspec/src/spec.rs
[dotenv]: https://secretspec.dev/providers/dotenv/
[manifest]: https://developer.atlassian.com/platform/forge/manifest-reference/environment/
[variables]: https://developer.atlassian.com/platform/forge/cli-reference/variables-set/
[environments]: https://developer.atlassian.com/platform/forge/environments/
