# Deployment compatibility evidence

Tickets 03–06 implemented and validated `fence-rider deploy [options]` on
2026-10-18 and 2026-10-19.
This page records executable evidence; the [variable contract](reference.md)
contains the routing policy and deferred compatibility work.

## Tested interfaces

| Component | Version | Evidence |
| --- | --- | --- |
| Bun | 1.4.3 | Compiled CLI subprocess tests; built-in TOML and YAML parsing |
| SecretSpec | 0.21.1 | Real schema and dotenv export through the compiled CLI |
| Forge CLI | 14.2.0 | Installed help and official command reference; controlled subprocess delegation |

No live Forge variable write or deployment was performed. Controlled Forge
executables verify argument boundaries, encryption flags, target consistency,
and local value availability, not server acceptance or encryption at rest.

## Invocation and resolution

Deployment accepts explicit environment targeting and forwards other Forge
options. Invalid or duplicate targets fail before external commands. Help and
version remain side-effect-free.

| Setting | Current behavior |
| --- | --- |
| Specification | `SECRETSPEC_FILE`, otherwise `secretspec.toml` in the working directory |
| Profile | `SECRETSPEC_PROFILE`, otherwise explicit `default` |
| Forge target | Explicit `-e` / `--environment`, resolved `FORGE_ENV`, then `development` |
| Authentication | Existing tool configuration and process environment; no automatic login |

Both prerequisites must be executable on `PATH` before resolution starts.
Non-empty or malformed `project.extends` and malformed scope metadata fail
before helper invocation. Empty `extends` is accepted. Native in-file profile
inheritance is delegated to SecretSpec, not reimplemented.

Schema and export receive the same absolute file and explicit profile:

```text
secretspec schema --file FILE --profile PROFILE
secretspec export --file FILE --profile PROFILE --scope "" --format json
```

SecretSpec 0.21.1 schema output contains `properties` and `required` names,
without resolved values or scope membership. Optional strings have the type
`["string", "null"]`. Export produces one flat JSON object of string values;
an absent optional value is omitted, not exported as null. The blank scope
clears ambient scope selection. A real dotenv test confirms that a missing
unscoped required value fails full-profile resolution despite an inherited
`SECRETSPEC_SCOPE=runtime`. Another confirms native default-profile inheritance
with the same explicit non-default profile for schema and export. A standalone
profile with `[profiles.release.defaults] inherit = false` excludes inherited
requirements and permits an empty runtime intersection. It must redeclare
native-required descriptions; Fence Rider does not merge profile fields.

An unknown ambient `SECRETSPEC_SCOPE` is also cleared, not interpreted as an
explicit request. Fence Rider has no scope-selection option: `runtime` and
`manifest` are fixed routing metadata, and native export always resolves the
full profile. Empty scope declarations and undeclared scope members fail
before native resolution. An empty native profile is invalid, while a profile
with only absent optional declarations exports `{}` and can deploy without
uploads. Empty `project.extends` is exercised with the native CLI as well.

The local fixture uses `SECRETSPEC_PROVIDER=dotenv:values.env`, isolated home
and XDG directories, and synthetic values only. Tests skip the real-SecretSpec
cases explicitly if its executable is unavailable; controlled tests always run.
No provider SDK, vault credentials, or network provider is used.

## Deployment options

Forge CLI 14.2.0 help and the published CLI source declare `-e` and
`--environment` with an optional upstream value. Fence Rider requires an
explicit value to avoid ambiguous targeting. Its accepted forms are
`-e TARGET`, `-eTARGET`, `--environment TARGET`, and `--environment=TARGET`.
Commander 14.0.3 documents attached short values and long equals syntax;
`-e=TARGET` includes the equals sign in the value and is rejected. Repeated
target options are rejected even when their values match. Invalid targets
are never echoed in diagnostics.

The chosen target is normalized to one `--environment TARGET` pair for every
upload and deployment. Deployment receives that pair before all preserved
arguments, including any `--` terminator. Tokens after `--` are payloads,
not target options. This preserves upstream parsing; it does not make excess
positional arguments valid for Forge deployment.

Other options retain their values, order, and argument boundaries. Required
values for `--tag` / `-t` and the first `--approve` value are consumed even
when they resemble target options, matching Commander. Boolean `-f` groups
containing `-e` are split only to remove the target; attached tag and major
version values stay opaque. Unknown Forge options are forwarded, not certified
or validated by Fence Rider. Option arity follows the verified Forge version,
not an extensible general-purpose parser.

`--non-interactive`, `--tag`, `--major-version`, `--approve`, and other deploy
options go only to `forge deploy`, never to `forge variables set`. In
particular, `variables set` has no documented `--non-interactive` option.
Help is wrapper-owned and is not delegated. SecretSpec file/profile selection
remains environment-only; no additional wrapper flags are introduced.
`FORGE_SITE` and `FORGE_PRODUCT` stay local and do not generate deployment
flags or runtime uploads. Installation and tunneling remain unsupported.

Controlled CLI subprocess tests verify these boundaries and target precedence;
no live app, variable write, or deployment is involved.

## Selection and destination behavior

The single TOML file supplies scope metadata. Effective membership is its
intersection with native schema declaration names. All required and exported
values are validated before any upload. Only strings without NUL are accepted;
structured values are rejected, not coerced. Native schema must describe an
object with string or nullable-string properties and a valid, unique required
name list. Null, array, malformed JSON, invalid names, and unsupported property
types fail closed; an optional nullable declaration does not authorize a null
exported value.

The native dotenv checks confirm the following value boundary:

| Representation | Observed behavior |
| --- | --- |
| Absent optional | Omitted from export and uploads; stale inherited process value removed before Forge runs |
| Explicit empty local string | Preserved in the Forge child environment |
| Explicit empty runtime string | Rejected before all uploads; never silently omitted |
| Strings `"0"` and `"false"` | Preserved unchanged locally and in encrypted upload arguments |
| JSON number, boolean, null, array, or object | Rejected without coercion, even after a valid selected entry |
| Numeric or boolean TOML default | Rejected by SecretSpec configuration validation |
| Native secret type `"number"` | Rejected by SecretSpec; its `type` field is not a JSON primitive type |
| Missing dotenv provider file | Resolution fails before any Forge command |

Only synthetic dotenv-provider behavior is verified. Other providers and Forge
server-side acceptance of key/value forms are not certified by these checks.

- All resolved application values are available to every Forge child. Declared
  but absent optional values do not inherit stale process values.
- A present `manifest` scope checks all effective members, including absent
  optionals, against string or keyed-object `environment.variables` entries.
  Omission skips this cross-check, not local availability. Forge still owns
  manifest substitution and complete manifest validation.
- Only present `runtime` members are uploaded. Omission or an empty active-profile
  intersection still validates the full profile and deploys without writes or
  deletion. Local controls `FORGE_ENV`, `FORGE_SITE`, and `FORGE_PRODUCT` cannot
  be runtime uploads; selecting them fails before every upload.
- Every write uses `forge variables set --encrypt --environment TARGET KEY VALUE`.
  After all writes succeed, exactly one `forge deploy --environment TARGET` runs.
  The same resolved string supplies local use and remote upload.
- Subprocess arguments are distinct values without a shell. Controlled tests
  preserve quotes, spaces, newlines, dollar signs, backticks, and shell syntax
  without executing them. Empty and leading-dash runtime values are rejected
  before writes pending verified Forge positional-input support. Empty local
  strings are not silently discarded.
- Variable names use `^[a-zA-Z_][a-zA-Z0-9_]*$`; targets use
  `^[a-zA-Z0-9][a-zA-Z0-9_-]*$` in this initial wrapper boundary.

## Failure and confidentiality boundary

Helper stdout is captured in memory and never forwarded verbatim; stderr
is discarded. Wrapper-owned progress identifies uploads and deployment without
printing values, command lines, or third-party output. Diagnostics
identify the safe stage, declared variable name, and validated target when
available, including an explicit validated target during early configuration,
schema, and resolution failures. Invalid target values are never echoed.
Resolved values, secret-bearing command lines, raw helper errors,
and provider output are not logged or written by Fence Rider to caches or
intermediate files. Native SecretSpec retains ownership of its own audit and
provider behavior.

Resolution, validation, and upload failure prevent every later command.
Normal numeric deployment exit statuses are preserved exactly, including
nonzero statuses. Launch failures, child signal termination, and invalid
subprocess statuses cannot become success. Diagnostics report safe exit or
signal context; missing executables and launch failures identify the stage
and installation prerequisite without exposing native error details.

Sequential writes are not transactional. Once an upload is attempted, any
failure warns that remote variables may already have changed, including when
the first upload fails: an error does not prove that the destination rejected
the write. There are no retries, automatic rollback, or remote deletions.

### Interruption contract

The tested contract is POSIX process groups with Bun 1.4.3 on macOS. Each helper
has its own process group. Fence Rider forwards operator `SIGINT` or `SIGTERM`
to the active group and stops the workflow, returning 130 or 143 respectively,
even if the helper handles interruption by exiting zero. A helper that does
not exit within one second receives `SIGKILL`. Remaining group members are
killed when an interrupted helper exits, so descendants cannot survive merely
by ignoring the initial signal. Cleanup waits for the direct child to exit.

Compiled-CLI tests cover resolution, uploads, deployment, signal receipt,
non-success exit, and observable process termination, including an ignoring
helper and an ignoring descendant whose parent exits first. Every interruption
scenario uses an isolated CLI process, readiness records, bounded waits, and
cleanup on assertion failure. Synthetic secret markers in helper stdout,
stderr, exceptions, and interruption diagnostics remain absent from CLI output.
Malformed native JSON/schema/export tests exercise the data-result boundary;
impossible runtime status shapes are guarded without mocking Bun internals.

Windows signal/process-tree cleanup is not certified. POSIX descendants that
explicitly leave their process group, termination of Fence Rider that cannot
be handled such as `SIGKILL`, and operating-system failure are outside this cleanup
contract. Cleanup cannot undo remote writes or cancel work already accepted
by a remote service. Authorized live Forge acceptance and activation checks
remain ticket 07.

## Sources

- [Subprocess and native integration tests](../../tests/cli.test.ts)
- [Forge deploy][deploy]
- [Forge variables set][variables]
- [Published Forge CLI 14.2.0 package][forge-source]
- [Commander 14.0.3 option syntax and parser][commander]
- [Forge manifest variables][manifest]
- [SecretSpec dotenv provider](https://secretspec.dev/providers/dotenv/)

[deploy]: https://developer.atlassian.com/platform/forge/cli-reference/deploy/
[forge-source]: https://registry.npmjs.org/@forge/cli/-/cli-14.2.0.tgz
[commander]: https://github.com/tj/commander.js/tree/v14.0.3
[variables]: https://developer.atlassian.com/platform/forge/cli-reference/variables-set/
[manifest]: https://developer.atlassian.com/platform/forge/manifest-reference/environment/
