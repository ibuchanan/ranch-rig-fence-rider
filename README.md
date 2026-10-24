# Fence Rider

[![Atlassian license][license-badge]](LICENSE)
[![PRs Welcome][prs-badge]](CONTRIBUTING.md)

Fence Rider wraps the Forge CLI so a Forge app declares its configuration once
and every workflow gets the right values. You describe local, manifest and
runtime variables in a committed [SecretSpec](https://secretspec.dev) file; each
developer binds storage roles to their own backends: non-secret config may use
dotenv, while secrets require an approved secret backend. Fence Rider then
uploads the selected runtime variables encrypted and runs `deploy`, `lint`,
`install`, `uninstall` and `tunnel` with the resolved values. Nothing is added
to your deployed app.

It is for maintainers of Forge apps, especially sample apps that downstream
developers fork. Missing configuration fails at the workflow boundary instead of
surfacing later as a strange Forge error.

**Status:** private and unpublished. Locally tested with Bun 1.4.3, SecretSpec
0.21.1 and Forge CLI 14.2.0. Live Forge verification is blocked pending
authorization, so it is not certified against a real app; see the
[planned work](specs/README.md).

## Try it

Help and version need no configuration, vault, network or Forge login:

```sh
bun install
bun run build
./dist/fence-rider --help
./dist/fence-rider -h
./dist/fence-rider doctor --help
```

All commands support `-h` and `--help` for command-specific help.

`doctor` checks that SecretSpec and Forge are installed and in the tested range.
Both must be on `PATH`, and Forge must be authenticated; Fence Rider installs
neither and logs in to neither. To build a Forge app's full set of package
scripts step by step, follow the [tutorial](docs/tutorials/tutorial.md).

## Use it in a Forge app

Declare variables once in `secretspec.toml`. Only `runtime` members upload;
everything else stays local:

```toml
[profiles.default]
FORGE_ENVIRONMENT = { description = "Target", default = "development", providers = ["shared_config"] }
SERVICE_URL       = { description = "Service endpoint", required = true, providers = ["project_config"] }
API_TOKEN         = { description = "Runtime credential", required = true, providers = ["project_secrets"] }

[scopes.runtime]
secrets = ["API_TOKEN"]
```

Bind these [storage roles](docs/reference/forge-tooling.md#storage-roles) in
your user configuration first. Alias names describe the required storage, but
do not enforce backend safety. Then call Fence Rider from short package scripts:

```json
{
  "variables": "fence-rider variables",
  "deploy": "cmd=$(fence-rider deploy -- --non-interactive) && sh -c \"$cmd\" sh",
  "release": "fence-rider variables && cmd=$(fence-rider deploy -- --non-interactive) && sh -c \"$cmd\" sh"
}
```

`variables` uploads the runtime values encrypted. `deploy`, like `lint`,
`install`, `uninstall` and `tunnel`, prints a shell script that runs Forge under
`secretspec run`; the package script runs it. **These commands change remote
state.** Set up a disposable app first.

- [Install it and add package scripts](docs/how-to/installation.md)
- [Configure workstation providers](docs/how-to/configure-user-providers.md),
  then [declare app requirements and store secrets](docs/how-to/configure-app-secrets.md)
- Set up [local targets](docs/how-to/local.md) and [manifest inputs](docs/how-to/manifest.md)
- [Validate and manage installations](docs/how-to/use-forge-tooling.md), or
  [upload runtime variables, deploy, and tunnel](docs/how-to/runtime.md)

## Documentation

- [Command help](docs/reference/command-help.md) and [variable contract](docs/reference/reference.md)
- [Provider storage roles and configuration](docs/reference/forge-tooling.md)
- [Why Forge has three kinds of variables](docs/explanation/three-kinds-of-env-vars.md)
- [Why use SecretSpec with Fence Rider?](docs/explanation/secrets-and-forge-tooling.md)
- [What Fence Rider is for, and where it stops](docs/explanation/scope-and-boundaries.md)
- Maintainer material: [acceptance criteria](docs/reference/acceptance-criteria.md),
  [specification validation](specs/validation.md), [decision records](docs/adr/),
  and [specifications](specs/README.md)

## Contributing and support

Run `bun run test` for the public CLI suite, or `bun run check` for the
repository gate. See [DEVELOPMENT.md](DEVELOPMENT.md) for prerequisites,
optional native checks, and known validation failures. Contributions are
welcome under [CONTRIBUTING.md](CONTRIBUTING.md); report vulnerabilities
through [SECURITY.md](SECURITY.md).

## License

Apache 2.0 licensed; see [LICENSE](LICENSE).

[license-badge]: https://img.shields.io/badge/license-Apache%202.0-blue.svg?style=flat-square
[prs-badge]: https://img.shields.io/badge/PRs-welcome-brightgreen.svg?style=flat-square
