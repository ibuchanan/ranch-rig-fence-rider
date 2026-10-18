# Deployment compatibility evidence

Ticket 03 implemented the bare `fence-rider deploy` workflow on 2026-10-18.
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

Only bare `deploy` is implemented in this slice. Other arguments fail before
external commands; environment overrides and option forwarding belong to
ticket 04. Help and version remain side-effect-free.

| Setting | Current behavior |
| --- | --- |
| Specification | `SECRETSPEC_FILE`, otherwise `secretspec.toml` in the working directory |
| Profile | `SECRETSPEC_PROFILE`, otherwise explicit `default` |
| Forge target | Resolved `FORGE_ENV`, otherwise `development` |
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
- [Forge variables set][variables]
- [Forge manifest variables][manifest]
- [SecretSpec dotenv provider](https://secretspec.dev/providers/dotenv/)

[variables]: https://developer.atlassian.com/platform/forge/cli-reference/variables-set/
[manifest]: https://developer.atlassian.com/platform/forge/manifest-reference/environment/
