# Install Fence Rider as development tooling

Use Bun 1.4.3+ on macOS/Linux arm64/x64. Install SecretSpec and the Forge
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
    "forge:lint": "cmd=$(fence-rider lint) && sh -c \"$cmd\" sh"
  }
}
```

`fence-rider lint` prints a shell script; it does not run Forge. The `&&` keeps
the script from running when Fence Rider refuses: an unguarded
`eval "$(fence-rider lint)"` would evaluate an empty string and exit 0, so a
refusal would silently pass. Passing the script to `sh -c` rather than `eval`
makes any arguments your script runner appends arrive as the script's `"$@"`
without being parsed a second time. Deploy and tunnel are the exceptions: they
run directly, as `fence-rider deploy` and `fence-rider tunnel`.

Declare your inputs first: adapt [`secretspec.toml`](../examples/secretspec.toml),
merge the [`manifest.yml`](../examples/manifest.yml) fragment, and use
[`values.env`](../examples/values.env) as a local template. See the
[local](local.md), [manifest](manifest.md) and [runtime](runtime.md)
guides for the procedures. Choose your own
provider, then run:

```sh
bun run forge:lint
```

For local synthetic values, select `SECRETSPEC_PROVIDER=dotenv:values.env` in your
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

```json
{
  "variables": "fence-rider variables",
  "deploy": "cmd=$(fence-rider deploy --non-interactive --approve MAJOR_VERSION_RULE) && sh -c \"$cmd\" sh",
  "deploy:reviewed": "cmd=$(fence-rider deploy --non-interactive --approve REVIEWED_RULE_FROM_FORGE) && sh -c \"$cmd\" sh",
  "release": "fence-rider variables && cmd=$(fence-rider deploy --non-interactive --approve MAJOR_VERSION_RULE) && sh -c \"$cmd\" sh",
  "install:forge": "cmd=$(fence-rider install --confirm-scopes --non-interactive) && sh -c \"$cmd\" sh",
  "upgrade:forge": "cmd=$(fence-rider install --upgrade --confirm-scopes --non-interactive) && sh -c \"$cmd\" sh",
  "uninstall:forge": "cmd=$(fence-rider uninstall) && sh -c \"$cmd\" sh",
  "lint:forge": "cmd=$(fence-rider lint) && sh -c \"$cmd\" sh",
  "tunnel": "cmd=$(fence-rider tunnel) && sh -c \"$cmd\" sh"
}
```

`MAJOR_VERSION_RULE` is the documented Forge approval rule. Replace the explicit
`REVIEWED_RULE_FROM_FORGE` placeholder with a different exact rule reported by
Forge before using that variant; no second server rule is certified here. The
automated controlled test establishes distinct-token forwarding, not server
acceptance. Rules are forwarded policy, not automatic approval of all changes.
Deployment approval does not grant install scope consent. Keep `--confirm-scopes`,
`--non-interactive` and `--upgrade` only where that policy is intended.

`release` uploads runtime values with `variables` and then deploys; the `&&`
stops before deploying if the upload fails. Forge 14.2.0 has no uninstall
`--non-interactive` flag, so `uninstall:forge` injects no policy: run it only
with removal authorization. Evidence limits and live blockers are in the
[consumer acceptance reference](../reference/consumer-workflows.md).
