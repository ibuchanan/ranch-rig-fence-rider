# Install Fence Rider as development tooling

Use Bun 1.4.3+ on macOS/Linux arm64/x64. Install SecretSpec and the Forge
CLI separately so both are on `PATH`, and authenticate Forge. This project is private
and unpublished; use a local package artifact, not a registry package. See the
[tested versions and evidence](../../specs/validation.md).

## Pack and install

From the Fence Rider checkout:

```sh
bun pm pack --ignore-scripts --filename fence-rider.tgz
```

From the consuming Forge app, substitute the absolute artifact path:

```sh
bun add --dev /absolute/path/to/fence-rider.tgz --ignore-scripts
bun run fence-rider --help
bun run fence-rider doctor
```

`doctor` reports the SecretSpec and Forge versions found on `PATH` against the
supported and tested range. Fence Rider downloads nothing and installs nothing,
and configured workflows do not pre-check versions.

## Run a short script

Add a consumer script to `package.json`:

```json
{
  "scripts": {
    "lint:forge": "cmd=$(fence-rider lint) && sh -c \"$cmd\" sh"
  }
}
```

`fence-rider lint` prints a shell script; it does not run Forge. The `&&` keeps
the script from running when Fence Rider refuses: an unguarded
`eval "$(fence-rider lint)"` would evaluate an empty string and exit 0, so a
refusal would silently pass. Passing the script to `sh -c` rather than `eval`
makes any arguments your script runner appends arrive as the script's `"$@"`
without being parsed a second time. Deploy and tunnel use the same script
execution pattern; only `variables` uploads directly.

Declare your inputs first: adapt
[`secretspec.toml`](../examples/secretspec.toml),
merge the [`manifest.yml`](../examples/manifest.yml) fragment, and use
[`values.env`](../examples/values.env) as a local template. See the
[local](local.md), [manifest](manifest.md) and [runtime](runtime.md)
guides for the procedures. Choose your own
provider, then run:

```sh
bun run lint:forge
```

For local synthetic values, select `SECRETSPEC_PROVIDER=dotenv:values.env` in
your
shell or CI configuration. Keep provider values out of scripts and Git.

If a command reports a missing tool, or a step fails after a tool upgrade, run
`bun run fence-rider doctor` and install a version in the tested range. The
generated scripts check nothing about `PATH` themselves, so a missing tool shows
up as the shell's "command not found" when the script runs. No
fallback binary is used, and no consumer helper or dependency postinstall script
is needed.

## Add the full script set

Merge the scripts from [the tested package example](../examples/package.json)
into the app's existing `package.json`, retaining the installed development
dependency. Obtain permission for the particular app, site and environment
before running any command that contacts Forge.

Review the example's deployment approval rules before copying them. The
`deploy:reviewed` rule is a placeholder: replace it only with a rule Forge
reports for an intentionally reviewed major version. Do not execute it unchanged.

When writing a script, put wrapper options before Fence Rider's `--` and Forge
options after it. When invoking a configured script, append Forge arguments
after the script name; its wrapper separator is already consumed:

```sh
bun run deploy --environment development --verbose
```

Use `variables` separately for uploads, or `release` for upload followed by
deployment. Do not append target overrides to `release`: they reach only
deployment. Follow the [runtime procedure](runtime.md#upload-variables-and-deploy)
for matched targets and the [installation management guide](use-forge-tooling.md)
for install, upgrade, and removal.

Evidence limits and live blockers are in the
[tested versions and evidence](../../specs/validation.md).
