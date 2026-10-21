# Variable compatibility contract

Status: configured deploy, lint, install/upgrade, uninstall and
development tunnel are implemented and locally verified as of 2026-10-20.
The installed Bun package requires SecretSpec and Forge on `PATH`. Authorized live
Forge verification is blocked. The [consumer evidence map](consumer-workflows.md)
and [deployment evidence](deployment.md) separate native SecretSpec delivery,
controlled Forge behavior, and unverified upstream acceptance.

This reference defines variable declarations, local availability, manifest
checks, and runtime upload selection for deployment. Configured lint prints a
script that runs under `secretspec run`, without uploads or injected
target flags; its [output boundary](#configured-lint)
differs from private deployment output.
The repository-owned `secretspec.toml` specifies and validates every variable.
There is no separate Fence Rider variable inventory or provider schema.

Usage text for each command lives only in the [command help](command-help.md),
which embeds the CLI output.

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

## Installed tool delivery

The private local package exposes `fence-rider` under Bun 1.4.3+. Explicit
SecretSpec and Forge are separate prerequisites on `PATH`, for the package
and the compiled binary alike; no command downloads or installs tools. Forge and
provider authentication remain separate. See [installation reference](installation.md)
for `fence-rider doctor`, platforms, and install-script policy.

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
FORGE_ENVIRONMENT = { description = "Forge environment", default = "development" }
SERVICE_URL = { description = "External service URL", required = true }
API_KEY = { description = "External service credential", required = true }

[scopes.manifest]
secrets = ["SERVICE_URL"]

[scopes.runtime]
secrets = ["SERVICE_URL", "API_KEY"]
```

`FORGE_ENVIRONMENT` needs no scope. `SERVICE_URL` is both a checked manifest input
and a remote runtime variable. `API_KEY` is also locally available, but only
runtime membership authorizes its upload. Omitting `manifest` would not
prevent the local `SERVICE_URL` from supplying a Forge substitution.

## Profiles and Forge targets

A SecretSpec profile and a Forge environment are distinct identifiers.
Selecting a profile does not automatically select a same-named environment.

| Local control | Meaning | Deployment treatment |
| --- | --- | --- |
| `FORGE_ENVIRONMENT` | Configured Forge environment | Used after an explicit CLI environment option and before the `development` fallback |
| `FORGE_SITE` | Site default for install/uninstall | Validated when declared; not injected as an unsupported deployment option |
| `FORGE_PRODUCT` | Product default for install/uninstall | Validated when declared; not injected as an unsupported deployment option |

These controls need no named scope. Selecting any of them for runtime upload
fails before the first write. Defaults are
native SecretSpec declaration fields, not a second configuration format.

`FORGE_ENVIRONMENT` is the only environment control; there is no alias.
Absent optional controls do not retain stale inherited values.

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
- Each declared value is read once, by the whole-profile export, and reused in
  the local process environment and any runtime upload. Scope membership
  queries use names only and never supply values, so copies cannot diverge.
  A run makes up to three SecretSpec resolutions; none is a vault-wide atomic
  snapshot.
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

The implemented boundary uses native profile schema, one full export, and
value-free scope membership queries, as specified below. Native
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

### Scope membership is delegated to SecretSpec

Fence Rider does not read `secretspec.toml`. `project.extends`, profile
inheritance, scope placement, and scope validation are SecretSpec's, so
cross-file specifications work as SecretSpec resolves them. It passes no
`--file` or `--profile`; SecretSpec reads `SECRETSPEC_FILE` and
`SECRETSPEC_PROFILE` from the inherited environment and auto-detects the file.

The metadata boundary is:

- Resolve the whole profile once for deploy and tunnel: `secretspec schema` for
  effective names and types, `secretspec export --scope "" --format json` for
  values.
- Ask SecretSpec for the members of `manifest` (deploy, tunnel) and
  `runtime` (deploy, tunnel) with `secretspec check --json --scope NAME`. The
  report is value-free and includes optional declarations absent from exported
  values, so the manifest check still covers them. Lint, install and uninstall
  make no SecretSpec call at all: they print a script that runs under
  `secretspec run`. `fence-rider doctor` asks for `manifest` when the file
  declares that scope, so the manifest check for lint now lives there.
- A scope the file does not define has no members, so a missing runtime scope
  means no uploads. SecretSpec reports this only as "is not defined in
  secretspec.toml" on stderr, which Fence Rider matches without printing it.
- `manifest.yml` is read only when the manifest scope has members.

Required checks cover an undefined scope, an optional member absent from
exported values, and native default-profile inheritance and its opt-out.
These checks pass through the compiled CLI, including native SecretSpec
integration. Decision record:
[ADR 0002](../adr/0002-delegate-scope-membership-to-secretspec.md).

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

### Forge argument parsing

`deploy`, `install`, `uninstall`, `tunnel` and `lint` share one small reader
(`src/forge-args.ts`). It lifts out only the options the wrapper owns
(`--environment`/`-e`; for installation and uninstall also `--site`/`-s`
and `--product`/`-p`, which are recognized only to be refused) and the help
flags. It does not model Forge's option table:
every other argument is forwarded untouched and in order, and Forge reports
anything malformed. Everything after `--` is forwarded untouched. Repeated
owned options and a short option followed by `=` (`-e=dev`) are rejected.

**Grouped short flags are not parsed.** A group such as `-feproduction` is
forwarded to Forge as written, so the wrapper cannot see an owned option inside
it. The wrapper still injects its own `--environment`; whether Forge accepts
the combination is Forge's decision. This trades strictness for not
re-implementing Forge's argument grammar. A payload that looks like an owned or
help flag (`--tag --environment`) is also read as that flag.

Owned values are checked only for being non-empty and not starting with a dash,
so a value can never be read as an option. Forge validates environment names,
site URLs and products.

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

`fence-rider lint [Forge options]` runs nothing. It prints one shell script on
stdout, `exec secretspec run --scope '' -- forge lint …` with the options given
to it quoted into the script, and a package script executes that output. Options
that a script runner appends later reach Forge through the script's `"$@"`
without being parsed again. The documented package script assigns the output
to a variable, then runs it with `sh -c` only if that assignment succeeded (see
the [short scripts](../how-to/consumer-workflows.md)): when Fence Rider refuses,
it prints the reason on stderr, nothing on stdout, and exits 1, so the `&&`
stops the script. Without the guard, `eval "$(fence-rider lint)"` evaluates an
empty string and exits 0, so a refusal would pass silently.

Because the script `exec`s `secretspec run`, the shell is replaced: Fence Rider
supervises nothing, and signals, the exit status and interactive input belong to
SecretSpec and Forge directly. Fence Rider checks neither `PATH` nor the
optional manifest declarations for lint; a missing tool is the shell's "command
not found" when the script runs, and `fence-rider doctor` reports both tool
versions and the manifest-scope check. SecretSpec resolves the entire active
profile into Forge's environment, so a required local, manifest, runtime, or
control value can block lint even when lint does not use it: this is
whole-profile repository readiness, not command-scoped requiredness. Native
optional declarations and profiles represent legitimate absence.

A missing required value fails inside `secretspec run` with SecretSpec's own
error before Forge starts. Like install and uninstall, lint does not validate
resolved values and does not clear a stale ambient value for an unresolved
optional declaration, and an exported variable that the profile neither declares
nor resolves stays visible to Forge. The generated text never contains a value.
See [ADR 0005](../adr/0005-install-and-lint-delegate-to-secretspec-run.md) and
[ADR 0006](../adr/0006-generate-shell-for-lint-install-uninstall.md).

No environment/site/product flags are injected. Explicit lint arguments,
including Forge's environment option, retain their boundaries and order; Forge
owns their validation. Runtime scope membership causes no upload, deployment,
installation, deletion, or other follow-up command. Controls-only profiles
work without dummy application secrets. Omitted manifest metadata does not
suppress local delivery or Forge's substitution requirements.

### Output and input policy

SecretSpec schema/export and encrypted-upload stdout remain private and stderr
is not shown. Deployment retains its existing suppressed-output contract.
Forge as run by the lint, installation, and uninstall scripts, and by tunnel,
inherits stdin, stdout, and stderr:
output is live, without redaction, and on its original stream; input is available
without wrapper prompts. Wrapper-owned diagnostics omit values and raw helper
errors. **Forge output, exception details, application logs, echoed input, and
terminal sessions may expose values**; Fence Rider provides no passthrough
redaction or credential isolation. Existing ambient authentication is retained.

This shared user-facing stdio mode serves lint, installation, uninstall, and
tunnel; it does not certify terminal-specific prompt behavior.
Ordinary pipe checks establish input and pre-exit streaming.
For tunnel and deploy, POSIX interruption forwards SIGINT/SIGTERM to the active
process group, escalates after one second, and kills remaining group members,
including when the direct child exits first. Lint, install and uninstall have no
Fence Rider process to interrupt: the terminal signals `secretspec run` and Forge
directly. Windows process-tree cleanup remains uncertified.

Numeric Forge lint statuses are preserved because the script replaces the shell.
Resolution, validation, launch, signal termination, and interruption are
non-success. Help-looking option values and terminator payloads are not
discovery requests.

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

`fence-rider install [Forge options]` runs nothing. It prints one shell script,
`exec secretspec run --scope '' -- sh -c SCRIPT sh install ARGS… "$@"`, and a
package script executes it as described for [lint](#configured-lint). SecretSpec
resolves the whole active profile into the child environment and the inner
script `exec`s Forge with inherited application values, ordinary settings, and
existing authentication. The inner script is a fixed string; the command and the
quoted arguments arrive as positional parameters, never interpolated. The
command needs `sh`. Fence Rider performs no `schema`, `export` or scope
lookup, no runtime upload, remote deletion, deployment, or optional manifest
declaration cross-check. Controls-only profiles work.
Installation does not activate changed runtime values. SecretSpec requiredness
applies to the whole profile, and `--scope ""` keeps an ambient
`SECRETSPEC_SCOPE` from narrowing it.

Because SecretSpec, not Fence Rider, builds the environment, install, uninstall
and lint differ from deploy and tunnel in three ways:

- Fence Rider does not validate the resolved values (string typing, NUL-free).
- A stale ambient value for an unresolved optional declaration is **not**
  cleared, because `secretspec run` leaves it in place.
- An exported variable that the profile neither declares nor resolves stays
  visible to Forge and is used by the script, so an exported `FORGE_SITE` fills
  a gap in the profile. A resolved value overrides an exported one.

| Target | Source (in the script) | Validation by the script |
| --- | --- | --- |
| Environment | `FORGE_ENVIRONMENT` in the child environment, else `development` | Nonempty, not starting with `-` |
| Site | `FORGE_SITE`; no fallback | Nonempty, not starting with `-` |
| Product | `FORGE_PRODUCT`; no fallback | Nonempty, not starting with `-` |

Forge is invoked as `forge install --environment E --site S --product P`
followed by the forwarded arguments, and Forge validates what the values mean.
The target options `--environment`/`-e`, `--site`/`-s` and `--product`/`-p` are
**not accepted**: any spelling of them is refused before any script is printed
(nothing on stdout, exit 1), because forwarding one would give Forge a second
copy of an option the script injects. A missing or invalid target fails in the
script before Forge, and Forge's target prompts never open. Someone who needs
explicit control writes the command with `secretspec` and `forge` directly, for
example
`secretspec run -- forge install --environment … --site … --product …`, which is
now almost what the wrapper does itself. See
[ADR 0004](../adr/0004-install-targets-from-profile-only.md) and
[ADR 0005](../adr/0005-install-and-lint-delegate-to-secretspec-run.md).
Bitbucket uses a workspace URL such as `https://bitbucket.org/workspace/`.
`--demo-site` / `-d` is forwarded to Forge unchecked, alongside the injected
`--site`; Fence Rider does not reconcile them. Feature-gated Teamwork Graph
installation is not certified here.

Upgrade is the same command with an explicit `--upgrade [all|code]` or `-u`
option. Fence Rider adds no upgrade, consent, non-interactive, license, or
approval policy. `--confirm-scopes`, `--non-interactive`, optional license
values, and variadic license/user options retain order and boundaries.
Required values for `--app-id-override`, `--major-version`, and `--unitId`
consume even switch-looking payloads; attached/equals payloads and everything
after `--` are preserved. The wrapper does not implement a universal parser
for future Forge options.

Forge input/output uses the [live output policy](#output-and-input-policy).
Numeric failures propagate. Help-looking required values and terminator payloads
are not help requests.

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

## Configured uninstall

`fence-rider uninstall [Forge options]` prints the script that runs exactly one
`forge uninstall` through `secretspec run --scope ''`, as described for
installation, with all
resolved local values, ordinary settings, and existing authentication. Stale
ambient values for unresolved optional declarations are not cleared. Missing
required app credentials or controls block execution. Controls-only
profiles work without runtime scope or dummy secrets. The optional manifest
cross-check and deployment-only runtime checks do not apply.

Environment/site/product use the [installation target contract](#configured-installation):
the resolved control, then `development` for environment only. Missing effective
site/product fails without target-selection prompts, and target options are
refused as for installation. Jira, Confluence, Compass, and Bitbucket are the
inspected products.

Uninstall's grammar is distinct from installation: required `--installation-id`
/ `-i` and `--app-id-override` values consume even switch-looking payloads.
Attached/equals values, unrelated argument order/boundaries, and all payloads
after `--` are preserved. Forge validates installation IDs and explicit
`--batch` behavior; the wrapper still requires all three effective targets.
Installation-only required-value grammar is not applied to uninstall.
Unknown options remain Forge's validation responsibility, not added support.

**Uninstall changes remote installation state.** The wrapper adds no runtime
upload, remote-variable deletion, deployment, installation, retry, or follow-up
command. No upgrade, approval, consent, confirmation, or non-interactive switch
is injected. Forge 14.2.0 uninstall has no `--non-interactive` option. A matched
target can uninstall directly; inherited input does not promise confirmation.
Forge owns remaining prompts and native uninstall effects, including related
installation contexts. This is not a read-only command.

The [live stdio policy](#output-and-input-policy) applies without redaction.
Numeric status is preserved and launch or signal failures cannot become
success, because the script replaces the shell and no Fence Rider process
supervises it. Required-value and terminator payloads are not help.

Observed 2026-10-19: installed Forge CLI 14.2.0 `uninstall --help`, published
14.2.0 `register-installation-commands.js`, `command.js`, and
`uninstall-command-helpers.js`, plus shared 9.8.0 product handling. Uninstall
registers context/environment, batch, installation ID, and app override options,
not installation's non-interactive/upgrade/consent options. Bun 1.4.3 inspection
emitted Forge's Node.js 22.x/24.x warning; this is interface evidence, not runtime
certification. Native SecretSpec 0.21.1 synthetic dotenv checks and controlled
Forge processes establish wrapper behavior, not live removal. No live uninstall
was authorized or executed. Real terminal-specific prompts and Windows tree
cleanup remain unverified. See the [procedure][uninstall-guide] and
[validation record](validation.md).

[uninstall-guide]: ../how-to/how-to.md#uninstall-the-configured-app

## Configured tunnel

`fence-rider tunnel [Forge options]` resolves the whole active profile once,
checks optional `manifest` declarations, and delegates one `forge tunnel`.
Required local, manifest, runtime, and control declarations still apply with
explicit target overrides. Ordinary resolved values, process settings, and
existing authentication remain available to Forge locally. No extra scope or
second variable inventory is required.

Only effective explicit `runtime` members are copied to
`FORGE_USER_VAR_<name>` in the tunnel child environment. Forge strips that
prefix for local function runtime variables; ordinary local inheritance is
not evidence of runtime delivery. Shared members use the same resolved value
locally and in that mapping. Absent optionals are omitted. Empty strings,
leading-dash strings, multiline values, `"0"`, and `"false"` are supported by
this environment mechanism, unlike deployment's positional upload contract.
The four targeting controls cannot be runtime members.

Ambient `FORGE_USER_VAR_` entries are removed before mapped members are added,
including stale optional and unrelated entries. Active-profile declarations
using that prefix are rejected, even if not runtime members: this avoids both
an implicit runtime bypass and silently losing declared local values. Ordinary
credentials/settings remain inherited; this is not credential isolation.

Target selection and the development-only rule are in the
[command help](command-help.md#tunnel). Empty, invalid, and duplicate explicit
targets fail before tools run. Forge, not the wrapper, rejects non-development
environments and validates names. Site/product flags are never injected.

Separated, long-equals and attached-short environment options normalize to one
effective target. Every other argument is forwarded in order, and Forge owns the
debug, `--url` and `--local-port` option grammar. Forge's `-h` is debug host, so
only `--help` requests wrapper help.

The [live stdio policy](#output-and-input-policy) applies without redaction,
including tunnel/app logs. Numeric Forge status propagates. Private helper,
launch, validation, and signal failures cannot become success. Operator
SIGINT/SIGTERM returns 130/143 with bounded POSIX group/descendant cleanup,
including ignoring helpers. Windows tree cleanup and terminal-specific
behavior remain unverified. No upload, variable deletion, deploy, installation,
retry, follow-up, or permanent secret file is added by wrapper orchestration.
A connected tunnel itself contacts Forge and redirects development invocations;
this is not a read-only or offline workflow.

Observed 2026-10-20: installed Forge CLI 14.2.0 `tunnel --help` and published
14.2.0 tunnel registration/environment/controller sources; `@forge/runtime`
7.0.1 `getUserVars` strips `FORGE_USER_VAR_` and preserves empty strings.
`@forge/tunnel` 7.3.0 builds each local invocation using that helper and the
local dev server's user variables. Official [tunneling][tunneling] and
[environment guidance][environments] describe local variables and named
development environments. Inspection under Bun 1.4.3 emitted Forge's Node.js
22.x/24.x support warning; this is interface evidence, not runtime certification.
Native SecretSpec 0.21.1 synthetic dotenv tests and controlled Forge subprocesses
prove wrapper mapping, not connected runtime receipt. No live tunnel was
authorized or run. See the [procedure][tunnel-guide] and [validation record](validation.md).

[tunneling]: https://developer.atlassian.com/platform/forge/tunneling/
[tunnel-guide]: ../how-to/how-to.md#tunnel-with-configured-local-runtime-values

## Verification ownership

Contract decisions are recorded in this reference. Their completion does not
depend on further executable proofs and does not certify upstream compatibility.
The deployment implementation verifies the native schema/export path with
synthetic values and controlled Forge tooling, extended for native inheritance,
optional and empty values, inherited environments, and invalid inputs. Separate
checks verify option handling and failure behavior.

Final acceptance reuses implementation checks and owns explicitly authorized
live Forge validation and supported-version reporting. Existing exploratory
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

Configured tunneling uses the explicit [local runtime mapping](#configured-tunnel),
not remote upload or ordinary environment inheritance alone. Connected runtime
receipt remains blocked pending authorization. Local availability does not
imply a general command runner.

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
