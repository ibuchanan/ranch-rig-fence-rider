# Install Fence Rider as development tooling

Use Bun 1.4.3+ on macOS/Linux arm64/x64. Install SecretSpec 0.21.1 and the Forge
CLI separately so both are on `PATH`, and authenticate Forge. See the
[installation reference](../reference/installation.md). This project is private
and unpublished; use a local package artifact, not a registry package.

## Pack and install

From the Fence Rider checkout:

```sh
bun pm pack --ignore-scripts --filename fence-rider.tgz
```

From the consuming Forge app, substitute the absolute artifact path:

```sh
bun add --dev /absolute/path/to/fence-rider.tgz --ignore-scripts
bun run fence-rider --help
secretspec --version
```

The second command should print `secretspec 0.21.1`. Fence Rider downloads
nothing and installs nothing; it checks that version before each configured
workflow.

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

If a command reports a missing `secretspec` prerequisite or an incompatible
version, install SecretSpec 0.21.1 and make sure it is first on `PATH`. No
fallback binary is used, and no consumer helper or dependency postinstall script
is needed.
