# Package installation and tool delivery

Fence Rider is a private, unpublished development tool. A local tarball can be
installed as a consumer's development dependency. The executable runs source
TypeScript with **Bun 1.4.3 or newer**; Node.js alone is not supported. Package
metadata admits macOS/Linux arm64/x64. Windows is unsupported.

## SecretSpec and Forge are prerequisites

Fence Rider does not download, install, or provision tools. The `secretspec`
and `forge` executables must be installed separately and found on `PATH`.
Forge and the selected provider require their own authentication. A consumer's
local `node_modules/.bin/forge` is discoverable from Bun scripts. Fence Rider
never registers apps, logs into providers, or grants consent.

Configured workflows do not pre-check versions. Script generation for `lint`,
`deploy`, `install`, and `uninstall` checks no executables. `tunnel` needs
SecretSpec while generating its script to obtain declared and runtime names,
but does not look for Forge. When a generated script runs, missing tools fail
at the shell handoff. `variables` checks both executables before resolving or
uploading values. Help, version, and invalid wrapper commands need neither.

### Doctor diagnostics

`doctor` compares installed versions with the lowest supported and highest
tested versions in `src/doctor.ts`. A newer-than-tested version is a warning;
an older-than-supported, missing, or unreadable tool fails the check. The lowest
versions, SecretSpec 0.17 and Forge CLI 1.3, are inferred from features used,
not exercised. The exercised baseline is recorded in
[specification validation](../../specs/validation.md#version-baseline).

| Check                        | Source                                                        | Failure conditions                                                                                             |
| ---------------------------- | ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Schema                       | `secretspec schema`                                           | Names outside letters, digits, underscores or starting with a digit; declarations not string or string-or-null |
| Manifest                     | `secretspec check --json --scope manifest` and `manifest.yml` | A manifest member lacks a Forge declaration                                                                    |
| Runtime                      | `secretspec check --json --scope runtime`                     | A local targeting control is selected for upload                                                               |
| Resolution, with `--resolve` | Full-profile `secretspec check --json`                        | A required value does not resolve                                                                              |

Schema and scope checks run whenever SecretSpec is available, independently of
a root-file scope declaration. Effective scopes include inherited definitions.
An absent or empty runtime selection uploads nothing and is not a failure.
Scope reports carry no values but may access providers. `--resolve` adds the
whole-profile required-value check; it does not print values either.

Doctor also makes an advisory TOML read of `SECRETSPEC_FILE` or
`./secretspec.toml`, warning about root-file scopes other than `manifest` and
`runtime`. An unreadable file skips that advisory check, not the native schema
and scope checks. Ambient-shadowing warnings name exported declarations,
controls, and malformed `FORGE_USER_VAR_*` names; they do not change exit
status. Doctor does not modify configuration or remote state.

## Package contents and execution

SecretSpec is Apache-2.0 upstream software. No SecretSpec SDK or additional npm
runtime dependency is used. Fence Rider belongs in a consumer's
`devDependencies`, never deployed app dependencies.

Local tarballs contain source, package metadata, README, consumer documentation,
and LICENSE, not tests, scratch fixtures, compiled builds, or credentials.
Maintainer specifications are repository-only. No dependency lifecycle script,
`setup` command, mirror variable, or cache is involved, so blocked install
scripts and `--ignore-scripts` do not prevent installation. The
[tool-delivery decision](../adr/0001-secretspec-cli-on-path.md) records the
rationale.

## Evidence and limits

Controlled tests use recording executables without Forge network access. When
real SecretSpec is available, native tests exercise synthetic dotenv data,
including installed-consumer checks; without it they skip. Only SecretSpec
0.21.1 is exercised, and live Forge behavior remains unverified. The
[validation record](../../specs/validation.md) maps these evidence levels to
the specification. Installation procedures are in the
[consumer guide](../how-to/installation.md).
