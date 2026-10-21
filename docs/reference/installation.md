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

Configured workflows do not pre-check tool versions. A missing executable stops
a workflow before Forge or any remote change runs, and a tool whose behavior has
changed incompatibly surfaces as the failure of the step that depends on it. Run
`fence-rider doctor` to compare the installed versions with the lowest supported
and highest tested release of each tool; the table is in `src/doctor.ts`. A
newer-than-tested version is a warning, an older-than-supported or unreadable
one is a failure. The lowest supported versions (SecretSpec 0.17, Forge CLI 1.3)
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
