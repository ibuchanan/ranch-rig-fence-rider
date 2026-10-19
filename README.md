# Fence Rider

[![Atlassian license][license-badge]](LICENSE)
[![PRs Welcome][prs-badge]](CONTRIBUTING.md)

Fence Rider is a development-time CLI that resolves a SecretSpec profile,
validates configuration, uploads only explicitly selected runtime variables
with Forge encryption enabled, then delegates deployment to the same Forge
environment. No vault SDK or Fence Rider code belongs in your deployed app.

Configured `lint` and `install` supply validated local inputs without runtime
uploads. Installation uses configured targets and caller-owned consent/upgrade
options. Their Forge output streams without redaction; see the
[workflow contracts](docs/reference/reference.md#configured-installation).

**Status:** single-file deployment, lint, and installation are locally tested with
Bun 1.4.3 and SecretSpec 0.21.1. Forge CLI 14.2.0 command interfaces have been
inspected; live encryption and deployment activation verification is
**blocked pending authorization**, not certified. This private source project
is not published as a package. Uninstall and tunneling remain unsupported;
use the Forge CLI directly for those workflows.

## Build and try the CLI

With Bun 1.4.3 installed, run from this checkout:

```sh
bun install
bun run build
./dist/cli --help
./dist/cli --version
```

Help and version need no configuration, vault, network, or Forge login.
Deployment, lint, and installation require separately installed and authenticated
SecretSpec and Forge CLIs on `PATH`, a valid registered Forge app, and a
single SecretSpec file. Fence Rider never installs tools or logs you in.

From that app's directory, using the absolute path to the built binary:

```sh
SECRETSPEC_PROVIDER=dotenv:values.env /absolute/path/to/dist/cli deploy --environment development --non-interactive
```

**This deployment command changes remote state.** Set up and review the
[local-provider deployment workflow](docs/how-to/how-to.md) first. It lets
contributors supply their own values without access to a maintainer's vault.
Only `runtime` scope members upload; other values stay local. Optional
`manifest` membership adds a declaration check, not an injection allowlist.

## Documentation

- [Deploy from development or CI](docs/how-to/how-to.md)
- [Run configured Forge lint](docs/how-to/how-to.md#run-configured-lint)
- [Install or upgrade the configured app](docs/how-to/how-to.md#install-or-upgrade-the-configured-app)
- [Variable contract and single-file limits](docs/reference/reference.md)
- [Version evidence and acceptance checks](docs/reference/deployment.md)
- [Why local, manifest, and runtime differ](docs/explanation/explanation.md)
- [Development and validation](DEVELOPMENT.md)
- [Product specification](specs/fence-rider-spec.md)

The [original exploration](specs/SecretSpec%20Atlassian%20Forge%20Integration%20Guide.md)
is historical input, not installation or provider guidance.

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
