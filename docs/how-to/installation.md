# Install Fence Rider as development tooling

Use Bun 1.4.3+ on macOS/Linux arm64/x64. Install the shell and archive tools listed
in the [installation reference](../reference/installation.md), including
`sha256sum`. Forge must be separately installed and authenticated. This project
is private and unpublished; use a local package artifact, not a registry package.

## Pack and install

From the Fence Rider checkout:

```sh
bun pm pack --ignore-scripts --filename fence-rider.tgz
```

From the consuming Forge app, substitute the absolute artifact path:

```sh
bun add --dev /absolute/path/to/fence-rider.tgz --ignore-scripts
bun run fence-rider --help
bun run fence-rider setup
```

Setup explicitly downloads pinned SecretSpec using the official installer. It
requires no global SecretSpec, provider login, or app credentials. It does not
contact Forge. If your network requires a pinned mirror, set the two mirror URLs
described in the reference before running setup. Do not disable integrity checks.

## Run a short script

Add a consumer script to `package.json`:

```json
{
  "scripts": {
    "forge:lint": "fence-rider lint"
  }
}
```

Declare your inputs in one `secretspec.toml`, choose your own provider, then run:

```sh
bun run forge:lint
```

For local synthetic values, select `SECRETSPEC_PROVIDER=dotenv:values.env` in your
shell or CI configuration. Keep provider values out of scripts and Git. See the
[configured workflow guide](how-to.md) for declaration and workflow examples.

If a command reports missing setup or an incompatible binary, rerun
`bun run fence-rider setup`. If setup fails, check connectivity, mirror contents,
`sha256sum`, executable permissions, and shell/archive tools; no fallback global
binary is used. Reinstalling the package requires setup again. No consumer helper
or trusted dependency postinstall script is needed.
