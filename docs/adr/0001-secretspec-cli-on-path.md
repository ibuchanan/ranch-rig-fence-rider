---
status: accepted
---

# Require the SecretSpec CLI on PATH instead of downloading it in `setup`

Fence Rider will resolve configuration by calling a `secretspec` executable the
consumer has installed themselves (for example `brew install`), the same way it
already treats `forge`. The current `fence-rider setup` flow, which downloads the
pinned cargo-dist installer from GitHub into `.tools/`, is expected to be
removed. The decision is made because it is the fastest and easiest path for the
maintainer's own use; it is not a claim that it is the best fit for every
downstream consumer, and it should be revisited if consumers cannot install the
CLI themselves.

## Considered options

### 1. CLI on PATH (chosen)

- Needs no out-of-band download, so it works behind proxies that block GitHub
  release assets, and it needs no install script.
- Most of the code exists: compiled builds already use
  `prerequisite("secretspec")`.
- Allows deleting `setup.ts`, the installer digest, the mirror variables
  (`SECRETSPEC_INSTALLER_URL`, `INSTALLER_DOWNLOAD_URL`), `.tools/`, the
  `sha256sum` requirement and the packaged-consumer delivery tests.
- Do not pre-check versions in workflows. The wrapper depends on the output
  shape of `secretspec schema` and `secretspec export --scope "" --format json`,
  but tool versions are expected to move safely, so contract changes surface as
  failures and error messages. A `fence-rider doctor` command reports the lowest
  supported and highest tested version of SecretSpec and Forge instead.
- Cost: `npm install` alone no longer yields a working tool. Docs must state the
  prerequisite and the error must say how to install it.

### 2. Keep the downloading `setup` (rejected)

The upstream CLI is not distributed on npm, so the wrapper fetched it from
GitHub at an explicit setup step. This fails wherever arbitrary downloads are
blocked, which is the common corporate case, and carries a large maintenance
surface (digests, mirrors, platform checks).

### 3. Use the npm SDK in place of the CLI (deferred, not rejected)

What was learned, as inspected on 2026-10-21 from the `secretspec@0.21.1`
tarball and registry metadata:
- The `secretspec` npm package is the **Node.js SDK**, not the CLI. It is a thin
  wrapper over a napi-rs native addon (`secretspec.node`) that statically embeds
  the same Rust resolver the CLI uses, so it inherits every provider. The
  platform packages have `main = secretspec.<platform>.node` and no `bin`; no
  npm package provides the CLI executable. This is why the repo's earlier
  "no SecretSpec SDK" note was about the CLI, not about npm having nothing.
- It is an alternative resolver for code running in Node. It does not read
  values the CLI exported and is not a client for the CLI. The usual app usage is
  `SecretSpec.builder().withProfile(..).load()` followed by `setAsEnv()` or
  `secrets.X.get()`.
- API surface: `withPath`, `withProfile`, `withScope`, `withProvider`,
  `withReason`, `withCaller`, `withNoValues`, `load`/`loadAsync` (throws
  `MissingRequiredError`), `report`/`reportAsync` (value-free inventory; does
  not throw on missing secrets), `Resolved.fields()`, `dispose()` for `as_path`
  temp files.
- It is versioned in lockstep with the CLI (0.21.1), served through npm
  mirrors such as Artifactory, needs no install script, and is delivered by the
  normal `npm install` flow through `optionalDependencies` platform packages.
- **Gaps for Fence Rider:**
  - No equivalent of `secretspec schema`. `resolveProfile` and
    `parseResolved(schema, exported)` in `src/configured.ts`/`src/resolution.ts`
    consume that output, so they would need rework. `report()` supplies names,
    `required` and status but it is not established that it covers everything
    parsed from the schema today.
  - Published addons are linux x64/arm64 (gnu and musl), darwin-arm64 and
    win32-x64. **There is no darwin-x64 (Intel Mac) package**, which the CLI
    path supports. Windows would be gained.
  - CLI-output-based tests (`tests/integration/real-secretspec/`)
    would need re-pointing at the SDK.

**Pivot trigger:** if downstream consumers cannot or will not install a
separate `secretspec` binary and run only on SDK-supported platforms, replace
`resolveProfile` with SDK calls, remove the PATH prerequisite, and add the
`secretspec` npm package as a dependency of the wrapper. A first step would be
confirming that `report()` plus the SDK's resolved fields carry what
`parseResolved` needs.

## Consequences

- Consumers are responsible for installing and upgrading SecretSpec; version
  drift is reported by `fence-rider doctor` and otherwise shows up as a failure.
