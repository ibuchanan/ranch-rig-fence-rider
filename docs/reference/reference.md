# Variable compatibility contract

This reference defines variable declarations, scope semantics, target
precedence, per-command behavior and the failure boundary for Fence Rider.
Tested versions and evidence levels are in the
[validation record](../../specs/validation.md#version-baseline); procedures are
in the [how-to guides](../how-to/installation.md); the reasoning is in
[Why Forge has three kinds of environment variables][explanation]. Usage text
for each command lives only in the [command help](command-help.md).

The repository-owned `secretspec.toml` specifies and validates every variable.
There is no separate Fence Rider variable inventory or provider schema.
Workflow resolution passes no `--file` or `--profile`; SecretSpec reads
`SECRETSPEC_FILE` and `SECRETSPEC_PROFILE` from the inherited environment.
Doctor's advisory TOML read identifies root-file scope names only; it does not
replace SecretSpec's effective schema or scope reports.

| Command                | Prints a script | Calls SecretSpec while running                                                 | Uploads                |
| ---------------------- | --------------- | ------------------------------------------------------------------------------ | ---------------------- |
| `variables`            | No              | `schema`, `export`, `check --scope`                                            | Yes, `runtime` members |
| `deploy`               | Yes             | No                                                                             | No                     |
| `lint`                 | Yes             | No                                                                             | No                     |
| `install`, `uninstall` | Yes             | No                                                                             | No                     |
| `tunnel`               | Yes             | `schema`, `check --scope runtime` while printing                               | No                     |
| `doctor`               | No              | `schema`, manifest/runtime scope checks; `--resolve` adds a full-profile check | No                     |

Every printed script runs under `secretspec run --scope ''`, which resolves the
whole active profile. `variables` is the only command that uploads, because
`forge variables set` is separate from `forge deploy`.

## Declaration ownership

| Concern                                              | Authority                                                    |
| ---------------------------------------------------- | ------------------------------------------------------------ |
| Variable names, descriptions, requirements, defaults | SecretSpec profile declarations                              |
| Active profile and provider resolution               | SecretSpec configuration and CLI                             |
| Provider authentication and fallback                 | SecretSpec and the selected provider                         |
| Local availability                                   | Full active-profile resolution; no named scope required      |
| Optional manifest consistency check                  | SecretSpec `manifest` scope compared with Forge declarations |
| Remote upload selection                              | SecretSpec `runtime` scope                                   |
| Control-value checks and orchestration               | Fence Rider                                                  |
| Manifest substitution and its validation             | Forge CLI                                                    |
| Encrypted remote storage and runtime activation      | Forge                                                        |

All three variable categories use SecretSpec declarations and validation. A
public declaration contains no secret values; non-sensitive literal defaults
use native SecretSpec syntax. Provider credentials stay under SecretSpec's
provider configuration and are not application variables unless explicitly
declared.

## Provider storage roles

The [provider convention](forge-tooling.md#storage-roles) names storage by
sharing boundary (`shared` or `project`) and sensitivity (`config` or `secrets`):
`shared_config`, `project_config`, `shared_secrets`, and `project_secrets`.
Relevant declarations select aliases explicitly with `providers`; operators
bind only the roles their app uses in user-global configuration. Committed
project alias definitions must not override those operator-owned bindings.

Storage roles do not determine scope membership. Secrets can remain local;
non-secret config can be uploaded when deployed code needs it. The convention
requires approved secret backends, matching isolation, and no secret-to-config
fallback. Neither SecretSpec alias names nor Fence Rider enforce those backend
properties; this is a configuration contract, not a new provider schema or
security-policy implementation.

## Scopes

| Selection         | Local behavior                                      | Fence Rider behavior                                 |
| ----------------- | --------------------------------------------------- | ---------------------------------------------------- |
| No named scope    | Resolved and validated with the full active profile | No upload; no manifest cross-check                   |
| `manifest` member | Same local availability                             | Checked against Forge's `environment.variables`      |
| `runtime` member  | Same local availability                             | Uploaded encrypted to the selected Forge environment |
| Both scopes       | One resolved value                                  | Manifest check and encrypted upload                  |

Scope constraints:
- Local availability is implicit; no `local` scope exists. Other native scopes
  have no meaning for Fence Rider.
- The full resolved environment reaches the delegated Forge processes.
  `manifest` is not an injection allowlist, and `runtime` does not remove a
  value from local use.
- Upload selection is never inferred from a prefix, environment file, process
  environment or the Forge manifest. Omitting a variable from `runtime` does
  not delete a value already stored remotely.

### Declaration shape

```toml
[project]
name = "sample-forge-app"
revision = "1.0"

[profiles.default]
FORGE_ENVIRONMENT = { description = "Forge environment", default = "development", providers = ["shared_config"] }
SERVICE_URL = { description = "External service URL", required = true, providers = ["project_config"] }
API_KEY = { description = "External service credential", required = true, providers = ["project_secrets"] }

[scopes.manifest]
secrets = ["SERVICE_URL"]

[scopes.runtime]
secrets = ["SERVICE_URL", "API_KEY"]
```

### Optional manifest check

| Condition                             | Result                                                                                                                     |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `manifest` scope has members          | Each member must appear in `environment.variables`, as a string or an object with `key`; a miss fails before remote writes |
| `manifest` scope absent               | The cross-check is skipped; SecretSpec validation, local values and substitution are unaffected                            |
| Forge declaration not in the scope    | Not an error                                                                                                               |
| Scope member unused in a substitution | Not an error                                                                                                               |

The check is metadata only: it does not define requiredness, replace Forge
lint, or rewrite the manifest. `manifest.yml` is read only when the scope has
members.

### No runtime uploads

| Condition                                                      | Result                                        |
| -------------------------------------------------------------- | --------------------------------------------- |
| `runtime` scope absent from the effective merged specification | No uploads                                    |
| Valid scope with no members in the active profile              | No uploads                                    |
| Root file omits an inherited `runtime` scope                   | Inherited scope stays in effect               |
| `secrets = []`                                                 | Invalid in SecretSpec; omit the scope instead |
| Unknown scope requested from SecretSpec                        | Error, never upload-all                       |

Deployment continues after validation and any manifest check; existing remote
variables are not deleted or reset.

### Native scope semantics

| Rule                      | Behavior                                                                                        |
| ------------------------- | ----------------------------------------------------------------------------------------------- |
| Placement                 | Top-level named tables with a `secrets` allowlist                                               |
| Members                   | At least one; no blank or repeated names; each declared in some profile                         |
| Selected set              | Intersection of the scope and the merged active profile; may be empty                           |
| Ownership                 | Profiles keep requirements, defaults, providers and addresses                                   |
| Scoped resolution         | Required declarations outside the scope do not block it, so it never validates the full profile |
| Blank CLI scope           | Clears an inherited scope; ambient scope must not narrow full-profile validation                |
| Conflict across `extends` | A later document replaces the whole same-named scope; lists are not merged                      |

## Profiles and Forge targets

A SecretSpec profile and a Forge environment are distinct; selecting a profile
does not select a same-named environment.

| Control             | Meaning                                                     | Treatment                                                               |
| ------------------- | ----------------------------------------------------------- | ----------------------------------------------------------------------- |
| `FORGE_ENVIRONMENT` | Configured Forge environment (the only environment control) | Used after an explicit CLI option and before the `development` fallback |
| `FORGE_SITE`        | Site for install and uninstall                              | Validated when declared; never injected into deployment                 |
| `FORGE_PRODUCT`     | Product for install and uninstall                           | Validated when declared; never injected into deployment                 |

Control validation:
- Controls need no named scope; selecting one for runtime upload fails before
  the first write.
- Validation covers the whole active profile. A missing required
  `FORGE_ENVIRONMENT` blocks an explicit `-e production` before Forge runs.
- `variables` clears stale ambient values for absent optional declarations.
  Generated scripts delegate to `secretspec run`, which may retain them.

## Resolution and validation boundary

- The whole active profile is resolved and validated before any upload;
  unscoped requirements participate.
- `variables` reads each value once, from the full export, and reuses it for the
  local environment and any upload. Scope queries use names only. A run makes up
  to three SecretSpec resolutions, none a vault-wide snapshot.
- Fence Rider checks control values, applicable manifest declarations,
  process-safe input and Forge runtime naming and value restrictions.
- An absent optional value is omitted. An empty string stays distinct from
  absence. Structured values are not stringified; `"0"` and `"false"` are kept.
- No resolved value is printed or persisted in a cache or temporary file.
- Declared names are removed from the child environment before resolved values
  are assigned, so absent optionals keep no stale ambient value. Other
  ambient settings and authentication are inherited, not isolated.

| Metadata need                        | Source                                                                                                    |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| Effective names, types, requiredness | `secretspec schema`                                                                                       |
| Values                               | `secretspec export --scope "" --format json`                                                              |
| Scope members                        | `secretspec check --json --scope NAME`, value-free, includes optional declarations absent from the export |
| Undefined scope                      | No members; SecretSpec's "is not defined in secretspec.toml" stderr is matched, not printed               |

Scope membership, `project.extends`, profile inheritance and scope validation
are SecretSpec's. See [ADR
0002](../adr/0002-delegate-scope-membership-to-secretspec.md).

## Upstream command interfaces

| Interface                                                   | Behavior relied on                                                               |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `secretspec export --format json`                           | Name-to-value object; non-interactive; fails on missing required values          |
| `secretspec export --scope NAME --format json`              | Only the scope and profile intersection; does not unset inherited process values |
| `secretspec check --json`                                   | Value-free report; never prompts; fails on missing required values               |
| `secretspec run -- COMMAND`                                 | Resolved profile values in the child environment                                 |
| `secretspec run --scope NAME -- COMMAND`                    | Narrowed resolution; not full-profile validation                                 |
| `forge variables set --encrypt --environment ENV KEY VALUE` | Sets an encrypted remote variable                                                |
| `forge deploy --environment ENV`                            | Deploys to the environment; supports non-interactive operation                   |

### Forge argument parsing

Commander 15 owns command discovery, wrapper option parsing and generated help.

| Input                                           | Behavior                                                                                    |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `-h`, `--help`, `help <command>`                | Generated help without configuration or helper access; `-h` applies to tunnel too           |
| `-e TARGET`, `--environment=TARGET`, `-eTARGET` | Wrapper environment on deploy, variables and tunnel                                         |
| Repeated scalar option                          | Last value wins; each supplied target must pass validation                                  |
| `-e=value`                                      | Literal attached value `=value`; use separated short or long-equals syntax instead          |
| First `--`                                      | Consumed by Fence Rider; remaining words go verbatim to Forge, including later `--` markers |
| Unknown options or operands before `--`         | Refused before helper access, unless Commander handles a help/version request               |
| Grouped short flags before `--`                 | Commander syntax; not a transparent Forge argument group                                    |
| Forge flags after `--`                          | Not parsed by Fence Rider; may override injected profile defaults                           |
| `variables` and `doctor`                        | No Forge tail accepted                                                                      |

Wrapper diagnostics suppress Commander messages that could echo supplied input.
Discovery follows Commander conventions; for example an unknown command with
`--help` displays top-level help rather than performing a workflow.

## Forge boundaries and failures

| Topic                 | Contract                                                                                                                                                                 |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Manifest substitution | Forge reads it from its process environment and also needs the `environment.variables` declaration; it is not a runtime entry, and a manifest field may expose its value |
| Runtime activation    | `variables`, then deploy to the same app and environment                                                                                                                 |
| Encryption            | Occurs on Atlassian's servers after receipt; no secrecy from the platform or local process inspection                                                                    |
| Upload values         | Positional; empty and leading-dash values are rejected before all uploads                                                                                                |
| Pre-upload failure    | SecretSpec validation or a manifest mismatch prevents all uploads                                                                                                        |
| Upload failure        | Stops later uploads; a chained `deploy` does not run; earlier uploads stay; no rollback                                                                                  |
| Diagnostics           | Omit resolved values, raw helper output and secret-bearing command lines                                                                                                 |
| Exit status           | Scripts preserve Forge's numeric status because they replace the shell; in `variables`, launch failure, signal or interruption is never success                          |

Pre-upload checks are not Forge's full lint pipeline; Forge may still fail
later.

### Output and input policy

| Stream                                                          | Behavior                                                                                                                  |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `variables`: SecretSpec schema, export and upload stdout        | Private; stderr not shown                                                                                                 |
| Forge under lint, deploy, install, uninstall and tunnel scripts | Inherits stdin, stdout and stderr; live, without redaction                                                                |
| Wrapper diagnostics                                             | Omit values and raw helper errors; option refusals include the cause and supported syntax without echoing argument values |

### CLI channels and exit status

| Invocation                    | stdout                                                  | stderr                                                | Exit status                                                    |
| ----------------------------- | ------------------------------------------------------- | ----------------------------------------------------- | -------------------------------------------------------------- |
| No arguments, help or version | Discovery text; no configuration or helper access       | Empty                                                 | 0                                                              |
| Script generation             | Executable POSIX shell script, not structured data      | Empty                                                 | 0                                                              |
| Refused arguments             | Empty                                                   | Cause and recovery guidance for wrapper-owned options | 1; before configuration or helper access                       |
| `variables`                   | Progress and final upload count, including zero uploads | Failure stage and safe details, if any                | 0 on completion; 1 on failure; 130 for SIGINT, 143 for SIGTERM |
| `doctor`                      | Diagnostic report, including failed checks              | Normally empty                                        | 0 when checks pass or warn; 1 when any check fails             |

A zero exit from script generation does not mean Forge ran or succeeded.
Executing
that script is a separate operation whose status belongs to SecretSpec or Forge.
Forge arguments after the explicit `--` are forwarded by script commands, not
validated by Fence Rider. `variables` accepts no forwarded arguments. Option
diagnostics are
plain text, not a stable machine-readable schema.

A failed upload may already have changed remote state. Fence Rider reports that
possibility and does not roll back or retry. SecretSpec and Forge interaction in
generated scripts remains inherited; generation grants no consent and injects no
confirmation bypass. Private helper calls used by `variables` and during tunnel
generation have closed stdin and captured output.

**Forge output, exception details, application logs, echoed input and terminal
sessions may expose values.** Fence Rider provides no redaction or credential
isolation.

| Interruption                 | Behavior                                                                                            |
| ---------------------------- | --------------------------------------------------------------------------------------------------- |
| `variables` on POSIX         | SIGINT/SIGTERM forwarded to the process group, escalated after one second, remaining members killed |
| Script commands              | No Fence Rider process; the terminal signals `secretspec run` and Forge directly                    |
| Windows process-tree cleanup | Not certified                                                                                       |

## Script commands

`lint`, `deploy`, `install`, `uninstall`, and `tunnel` do not run Forge while
printing. Each emits a shell script that a package script executes ([short
scripts][short-scripts]).

Wrapper options (e.g., `-e/--environment` for `deploy`, `variables`, `tunnel`)
must come
before the `--` separator. Forge options must come after `--` and are passed
verbatim.
Unknown wrapper arguments before `--` are refused with an error and no script
generation.
When Fence Rider refuses, it prints the reason on stderr, nothing on stdout, and
exits 1.

Arguments a script runner appends reach Forge through the script's `"$@"`
without being parsed again. Because the script `exec`s `secretspec run`,
signals, exit status and
interactive input belong to SecretSpec and Forge. Differences from `variables`:

| Behavior                                                    | Script commands                                                      |
| ----------------------------------------------------------- | -------------------------------------------------------------------- |
| Wrapper-to-Forge separation                                 | `--` marks the boundary; wrapper options before, Forge options after |
| Value validation (string typing, NUL-free)                  | Not performed                                                        |
| Stale ambient value for an unresolved optional              | Not cleared                                                          |
| Exported variable the profile neither declares nor resolves | Visible to Forge; a resolved value overrides an exported one         |
| `PATH` and manifest-declaration checks                      | None; use `doctor`                                                   |
| Missing required value                                      | SecretSpec's own error before Forge starts                           |
| Generated text                                              | Contains explicit caller arguments, never provider-resolved values   |

See [ADR 0005](../adr/0005-install-and-lint-delegate-to-secretspec-run.md) and
[ADR 0006](../adr/0006-generate-shell-for-lint-install-uninstall.md).

## Configured lint

`fence-rider lint [--] [Forge options]` prints
`exec secretspec run --scope '' -- forge lint …`.

| Aspect                    | Contract                                                                              |
| ------------------------- | ------------------------------------------------------------------------------------- |
| Forge options             | Passed after `--`; any before the separator are rejected as unknown wrapper arguments |
| Targeting flags           | None injected; explicit arguments keep their order and boundaries                     |
| Requiredness              | Whole-profile: any required local, manifest, runtime or control value can block lint  |
| Follow-up                 | No upload, deployment, installation or deletion                                       |
| Controls-only profiles    | Work without dummy secrets                                                            |
| Omitted manifest metadata | Does not suppress local delivery or Forge's substitution requirements                 |
| Exit status               | Forge's numeric status                                                                |

## Configured installation

`fence-rider install [--] [Forge options]` prints
`exec secretspec run --scope '' -- sh -c SCRIPT sh install ARGS… "$@"`. The
inner script is a fixed string; the command and quoted arguments arrive as
positional parameters, never interpolated. It needs `sh`, and runs no
`schema`, `export` or scope lookup, upload, deletion, deployment or manifest
cross-check. Installation does not activate changed runtime values.

| Target      | Source (in the script)                                           | Validation                       |
| ----------- | ---------------------------------------------------------------- | -------------------------------- |
| Environment | `FORGE_ENVIRONMENT` in the child environment, else `development` | Non-empty, not starting with `-` |
| Site        | `FORGE_SITE`; no fallback                                        | Non-empty, not starting with `-` |
| Product     | `FORGE_PRODUCT`; no fallback                                     | Non-empty, not starting with `-` |

| Aspect                                                            | Contract                                                                                                 |
| ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Forge options                                                     | Passed after `--`; any before the separator are rejected as unknown wrapper arguments                    |
| Forge call                                                        | `forge install --environment E --site S --product P` plus forwarded arguments                            |
| Target options `-e`, `-s`, `-p` and long forms                    | Refused before the handoff; accepted verbatim after `--` and may override injected defaults              |
| Missing or invalid target                                         | Fails in the script before Forge; Forge's target prompts never open                                      |
| Explicit control                                                  | `fence-rider install -- --site SITE` forwards an override; required profile defaults must still validate |
| `--demo-site` / `-d`                                              | Forwarded unchecked beside the injected `--site`; not reconciled                                         |
| Bitbucket site                                                    | A workspace URL such as `https://bitbucket.org/workspace/`                                               |
| Upgrade                                                           | `--upgrade [all\|code]` or `-u`; no upgrade, consent, non-interactive, license or approval policy added  |
| `--confirm-scopes`, `--non-interactive`, license and user options | Forwarded in order with their boundaries                                                                 |
| `--app-id-override`, `--major-version`, `--unitId`                | Passed as-is after the handoff; Forge parses their values                                                |
| Equals and attached payloads, everything after `--`               | Preserved                                                                                                |
| Help-looking values and terminator payloads                       | Not help requests                                                                                        |
| Feature-gated Teamwork Graph installation                         | Not certified                                                                                            |

Future Forge options are not modelled. Profile defaults remain required even
with an explicit Forge override. The former profile-only restriction in
[ADR 0004](../adr/0004-install-targets-from-profile-only.md) no longer applies
to the explicit Forge tail. Delegation still follows
[ADR 0005](../adr/0005-install-and-lint-delegate-to-secretspec-run.md).

## Configured uninstall

`fence-rider uninstall [--] [Forge options]` prints a script that runs one
`forge uninstall` under `secretspec run --scope ''`, as for installation.

| Aspect                                                            | Contract                                                                                                                 |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Forge options                                                     | Passed after `--`; any before the separator are rejected as unknown wrapper arguments                                    |
| Targets                                                           | The [installation targets](#configured-installation); site and product required, environment falls back to `development` |
| Target options                                                    | Refused before `--`; explicit Forge overrides after it are passed as for installation                                    |
| Products                                                          | Jira, Confluence, Compass, Bitbucket                                                                                     |
| Required values                                                   | `--installation-id`/`-i` and `--app-id-override` are parsed by Forge, not Fence Rider                                    |
| Attached and equals values, argument order, everything after `--` | Preserved                                                                                                                |
| Installation-only value grammar                                   | Not applied                                                                                                              |
| Unknown options                                                   | Forge's validation                                                                                                       |
| Added behavior                                                    | No upload, variable deletion, deployment, installation, retry, follow-up, consent or non-interactive switch              |
| Forge 14.2.0                                                      | Has no `uninstall --non-interactive`; a matched target can uninstall directly                                            |

**Uninstall changes remote installation state.** Forge owns remaining prompts
and native effects, including related installation contexts. It is not
read-only. See the [procedure][uninstall-guide].

## Configured tunnel

`fence-rider tunnel [-e, --environment TARGET] [--] [Forge options]` prints a
script
that runs one `forge tunnel` under `secretspec run`. Target selection and the
development-only rule are in the [command help](command-help.md#tunnel).

| Aspect                                                           | Contract                                                                                                       |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Wrapper options                                                  | `-e/--environment` before `--`; any other wrapper options are rejected                                         |
| Forge options                                                    | Passed after `--`; any before the separator are rejected as unknown wrapper arguments                          |
| Printing                                                         | Asks SecretSpec value-free for declared names and `runtime` members; does not check `manifest` (`doctor` does) |
| Declarations                                                     | Required local, manifest, runtime and control declarations apply, including with explicit targets              |
| Runtime mapping                                                  | A shell prologue copies only effective `runtime` members to `FORGE_USER_VAR_<name>`; Forge strips the prefix   |
| Mapped values                                                    | Empty strings, leading-dash strings, multiline values, `"0"` and `"false"` supported                           |
| Absent optionals                                                 | Omitted                                                                                                        |
| Targeting controls as runtime members                            | Not allowed                                                                                                    |
| Ambient `FORGE_USER_VAR_` entries (letters, digits, underscores) | Removed before mapped members are added                                                                        |
| Active-profile declarations with that prefix                     | Rejected, even if not runtime members                                                                          |
| Empty or invalid explicit target                                 | Fails before tools run; repeated valid wrapper options use the last value                                      |
| Non-development environment                                      | Rejected by Forge                                                                                              |
| Environment option spellings                                     | Separated, long-equals and attached-short normalize to one target                                              |
| Other arguments                                                  | Forwarded in order; Forge owns debug, `--url` and `--local-port`                                               |
| `-h`                                                             | Wrapper help if before `--`; Forge's debug host if after `--`                                                  |
| Site and product flags                                           | Never injected                                                                                                 |
| Added behavior                                                   | No upload, deletion, deploy, installation, retry, follow-up or permanent secret file                           |

A connected tunnel contacts Forge and redirects development invocations; it is
not read-only or offline. See the [procedure][tunnel-guide].

## Sources

- [SecretSpec scopes][scopes]
- [SecretSpec configuration reference][configuration]
- [SecretSpec CLI reference][cli]
- [SecretSpec resolver protocol][resolver]
- [SecretSpec dotenv provider][dotenv]
- [Forge manifest environment variables][manifest]
- [Forge variables set][variables]
- [Forge environments][environments]
- [Forge tunneling][tunneling]

[explanation]: ../explanation/three-kinds-of-env-vars.md
[short-scripts]: ../how-to/installation.md#run-a-short-script
[uninstall-guide]: ../how-to/use-forge-tooling.md#remove-an-installation
[tunnel-guide]: ../how-to/runtime.md#tunnel-during-development
[scopes]: https://secretspec.dev/concepts/scopes/
[configuration]: https://secretspec.dev/reference/configuration/
[cli]: https://secretspec.dev/reference/cli/
[resolver]: https://secretspec.dev/reference/resolver-protocol/
[dotenv]: https://secretspec.dev/providers/dotenv/
[manifest]: https://developer.atlassian.com/platform/forge/manifest-reference/environment/
[variables]: https://developer.atlassian.com/platform/forge/cli-reference/variables-set/
[environments]: https://developer.atlassian.com/platform/forge/environments/
[tunneling]: https://developer.atlassian.com/platform/forge/tunneling/
