# Deployment compatibility evidence

Tickets 03 and 04 implemented `fence-rider deploy [options]` on 2026-10-18.
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
with the same explicit non-default profile for schema and export.

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
structured values are rejected, not coerced.

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

Helper output is captured in memory and never forwarded verbatim. Diagnostics
identify the safe stage, declared variable name, and validated target when
available. Resolved values, secret-bearing command lines, raw helper errors,
and provider output are not logged or written by Fence Rider to caches or
intermediate files. Native SecretSpec retains ownership of its own audit and
provider behavior.

Resolution, validation, and upload failure prevent deployment. Delegation
failure returns nonzero. Sequential writes are not transactional: an earlier
successful write may remain changed if a later operation fails. Exact numeric
status propagation, partial-state warnings, and interruption cleanup remain
with ticket 06. Exhaustive value/provider edges belong to ticket 05; authorized
live Forge acceptance and activation checks belong to ticket 07.

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
