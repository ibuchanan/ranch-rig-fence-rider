# Package installation and tool delivery

Fence Rider is a private, unpublished development tool. A local tarball can be
installed as a consumer's development dependency. The executable runs source
TypeScript with **Bun 1.4.3 or newer**; Node.js alone is not supported. Package
metadata admits macOS/Linux arm64/x64. Windows is unsupported.

## SecretSpec and Forge are prerequisites

Fence Rider does not download, install, or provision any tool. The `secretspec`
and `forge` executables must be installed separately and found on `PATH`, for
example with a package manager such as Homebrew. The decision and the rejected
alternatives are recorded in
[ADR 0001](../adr/0001-secretspec-cli-on-path.md).

Configured workflows do not pre-check tool versions. For deploy and tunnel, a
missing executable stops the workflow before Forge or any remote change runs;
the scripts printed by lint, install and uninstall check nothing, so a missing
tool is the shell's "command not found" when the script runs. A tool whose
behavior has changed incompatibly surfaces as the failure of the step that
depends on it. Run
`fence-rider doctor` to compare the installed versions with the lowest supported
and highest tested release of each tool; the table is in `src/doctor.ts`. A
newer-than-tested version is a warning, an older-than-supported or unreadable
one is a failure.
`doctor` also reads the SecretSpec file and warns about any `[scopes.*]` table
other than `manifest` and `runtime`, which Fence Rider ignores; a scope read by
another tool is legitimate, so this is only a warning, and an unparsable file
only skips that check. When the file declares a `manifest` scope and `secretspec`
is on `PATH`, `doctor` also runs `secretspec schema`, which carries no values,
and fails a name outside letters, digits and underscores (or starting with a
digit) and a declaration that is not a string or string-or-null, the same rules
`variables` applies. It then runs the value-free
`secretspec check --json --scope manifest` and checks that `manifest.yml`
declares each member, so it reads providers; a missing declaration fails. This
is the manifest consistency check for lint, which no longer runs it. It likewise
runs `secretspec check --json --scope runtime` and reports how many members
`variables` would upload; an undefined or empty `runtime` scope is a warning,
because `variables` would upload nothing and still exit 0, and a local control
(`FORGE_ENVIRONMENT`, `FORGE_SITE`, `FORGE_PRODUCT`) among the members is a
failure, because `variables` refuses it. Finally it warns, by name only, about
exported values that can shadow a generated command: declared keys and local
controls, which `secretspec run` leaves in place for unresolved optional
declarations, and `FORGE_USER_VAR_*` names containing characters other than
letters, digits and underscores, which `tunnel` cannot clear. This check is
advisory and never changes the exit status. No value is printed. The lowest
supported versions (SecretSpec 0.17, Forge CLI 1.3)
are inferred from the features used, not exercised; the highest tested versions
are the only exercised baseline, SecretSpec 0.21.1 and Forge 14.2.0. No
dependency lifecycle script, `setup` command, mirror variable, or cache is
involved, so Bun's blocked install-script policy and `--ignore-scripts` do not
affect package installation. Help, version, and invalid commands need neither
tool.

SecretSpec is Apache-2.0 upstream software. No SecretSpec SDK or additional npm
runtime dependency is used. The wrapper belongs in a consumer's
`devDependencies`, never deployed app runtime dependencies. Local tarballs include
source, package metadata, README, documentation and LICENSE, not tests, scratch
fixtures, compiled builds, or credentials.

Forge remains separately installed and authenticated. A consumer's local
`node_modules/.bin/forge` is discoverable from Bun scripts. Fence Rider never
installs Forge, registers an app, logs into providers, or grants consent.

## Evidence and limits

Ordinary tests use controlled executables and need no network. When a real
`secretspec` is on `PATH`, the suite also runs native synthetic dotenv checks,
including installed-consumer checks against that executable; without it they
skip rather than claiming SecretSpec compatibility. Only the 0.21.1 release is
exercised. See [validation](validation.md) and the
[consumer installation guide](../how-to/installation.md).
