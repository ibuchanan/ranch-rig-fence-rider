# Package installation and tool delivery

Fence Rider is a private, unpublished development tool. A local tarball can be
installed as a consumer's development dependency. The executable runs source
TypeScript with **Bun 1.4.3 or newer**; Node.js alone is not supported. Package
metadata admits macOS/Linux arm64/x64. Only macOS arm64 has exercised native
provisioning evidence; Linux and macOS x64 are not platform certifications.
Windows is unsupported by this delivery lifecycle.

## Setup contract

`fence-rider setup` is an explicit, separate setup step after dependency
installation. No dependency lifecycle script downloads tools, so Bun's blocked
install-script policy and `--ignore-scripts` do not prevent package installation.
Missing setup fails with instructions instead of falling back to global
SecretSpec. Ordinary commands, help, version, and invalid commands never provision
executables. The compiled standalone development build retains PATH-based tools;
its behavior is not proof of installed-package delivery.

Setup downloads the official SecretSpec **0.21.1** cargo-dist shell installer,
checks its SHA-256 before execution, and uses its unmanaged, flat installation
mode. The installer selects the native archive and checks its embedded SHA-256.
Fence Rider requires `sha256sum` because upstream otherwise skips that check.
Setup requires `sh`, standard POSIX utilities, `tar` with xz support, and the
upstream installer's HTTP transport (`curl` or `wget`). macOS users may need
coreutils to supply `sha256sum`.

Installer SHA-256:

```text
f5962bdfe702f0ad0894f9c5ce9187b6a3228edb3b26526954e32f91dc10aec7
```

The package-relative `.tools/secretspec` is selected deterministically and checked
for exact version 0.21.1 before profile resolution. It is not selected from PATH.
Setup stages under a private temporary directory inside `.tools`, verifies the
version, then renames the executable into place. Failed or interrupted setup
removes staging and leaves a previous successful executable intact. Normal
SIGINT/SIGTERM use bounded process-group cleanup; SIGKILL cannot run cleanup.
No shell profiles, global binaries, receipts, or updater are installed.

## Network, mirrors, and caches

Setup requires network access to GitHub release assets unless pinned assets are
served from an explicit mirror. `SECRETSPEC_INSTALLER_URL` overrides the installer
URL; `INSTALLER_DOWNLOAD_URL` overrides the archive base URL. Both still require
the pinned checksums. HTTPS is appropriate for remote mirrors; local HTTP is used
only for isolated test fixtures. The official upstream installer, not a custom
archive downloader, handles platform selection and extraction.

Every explicit setup reruns provisioning; there is no hidden tool cache or
runtime download. An already provisioned package runs offline with a local
provider and controlled Forge. Reinstalling or replacing the dependency can
remove `.tools`; rerun setup. Package caches contain the source tarball, not
resolved application values or a globally sourced executable. Setup's child gets
only PATH, private HOME/TMPDIR, its unmanaged destination, and an optional mirror
URL; it never resolves application declarations or inherits provider credentials.

Forge remains separately installed and authenticated. A consumer's local
`node_modules/.bin/forge` is discoverable from Bun scripts. Fence Rider never
installs Forge, registers an app, logs into providers, or grants consent.

## Distribution and evidence

SecretSpec is Apache-2.0 upstream software. Its pinned release distributes native
macOS arm64/x64 and Linux arm64/x64 GNU/musl archives. No SecretSpec SDK or
additional npm runtime dependency is used. The wrapper belongs in a consumer's
`devDependencies`, never deployed app runtime dependencies. Local tarballs include
source, package metadata, README, documentation and LICENSE, not `.tools`, tests,
scratch fixtures, compiled builds, or credentials.

On 2026-10-20, authenticated GitHub API downloads supplied a fresh official
installer and macOS arm64 archive. Digests matched release metadata. The real
installer ran against a local mirror in a freshly installed isolated consumer;
native dotenv/default resolution and lint passed with no global SecretSpec.
This is fresh asset acquisition plus mirrored provisioning, **not** a successful
anonymous direct-GitHub setup: that endpoint returned HTTP 422 in this environment.
Other platform execution and direct-endpoint compatibility remain unverified.

The optional native installed tests use `SECRETSPEC_TEST_ASSETS` pointing to a
directory containing the exact `secretspec-installer.sh` and host archive from the
pinned release. Without those assets, tests skip rather than claiming delivery.
Ordinary tests need no network. See [validation](validation.md) and the
[consumer setup guide](../how-to/installation.md).

Sources: [SecretSpec v0.21.1 release][release] and
[pinned cargo-dist configuration][dist]. Checksums establish consistency with the
pinned release, not independent publisher authenticity or legal approval.

[release]: https://github.com/cachix/secretspec/releases/tag/v0.21.1
[dist]: https://github.com/cachix/secretspec/blob/v0.21.1/dist-workspace.toml
