# Bind app requirements and set runtime secrets

Use this guide for a Forge app
that already has Fence Rider package scripts.
Complete [user-provider setup](configure-user-providers.md) first.
Run commands from the app root.
Use an approved writable backend behind `app_secrets`
and keep shell tracing (`set -x`),
terminal recording,
and agent capture disabled while entering credentials.

## Declare requirements, not values

Merge these declarations into the app's `secretspec.toml`.
Retain the existing project name
when configuring an existing app:
changing a name or profile can change the storage location in a provider.

```toml
[project]
name = "example-project"
revision = "1.0"

[profiles.default.FORGE_SITE]
description = "Forge site hostname"
required = true
providers = ["user_dotenv"]

[profiles.default.FORGE_PRODUCT]
description = "Forge installation product"
default = "jira"
providers = ["user_dotenv"]

[profiles.default.FORGE_ENVIRONMENT]
description = "Forge deployment environment"
default = "development"
providers = ["user_dotenv"]

[profiles.default.APP_BEARER_TOKEN]
description = "Runtime bearer credential for approved API operators"
required = true
providers = ["app_secrets"]

[scopes.runtime]
secrets = ["APP_BEARER_TOKEN"]
```

This declaration binds the runtime credential to a real backend
through the user's `app_secrets` alias.
The current app declaration may omit that explicit route
and rely on the user's default provider;
make it explicit to avoid a future user-default change sending writes to dotenv.
Do not commit a secret `default` value
or a developer's vault identifier.
A project alias, if defined,
shadows a same-named global alias.

Keep local controls out of `runtime`;
Fence Rider refuses to upload them.
Add other runtime names only when deployed functions actually need them.
When an app needs manifest variables,
declare an optional `manifest` scope
and matching `environment.variables` in its Forge manifest;
do not assume the runtime scope configures the manifest.

## Store an existing credential

Run this yourself in a trusted terminal:

```sh
secretspec set --provider app_secrets --profile default APP_BEARER_TOKEN
```

Enter the credential at the prompt.
This changes the selected provider,
not Forge's runtime variable store.
Follow the provider's own authorization and rotation procedure
if updating an existing credential.

## Generate a new credential without a plaintext file

For a new app,
or an approved rotation,
run this pipeline in Bash with pipeline failure propagation enabled:

```sh
set -o pipefail
set +x
openssl rand -hex 32 | tr -d '\n' |
  secretspec set --provider app_secrets --profile default \
    --from-file - APP_BEARER_TOKEN
```

The command generates 32 random bytes (256 bits)
represented as 64 hexadecimal characters,
removes the trailing newline,
and passes the exact bytes on stdin.
It neither prints the token nor places it in shell history or an argument.
It still writes wherever `app_secrets` points:
verify that alias before use.
`--from-file -` requires SecretSpec 0.21+.
A failed pipeline is a failure;
do not continue with upload or deployment.

Do not regenerate on every deploy.
Rotating this bearer credential requires coordinating approved API clients;
an existing token stops working after its replacement becomes active.
Provision clients through an approved secret channel,
not a log or chat message.

## Validate without revealing the credential

```sh
secretspec check --profile default --scope '' --explain
secretspec check --profile default --scope runtime --json
bun run fence-rider doctor --resolve
```

Expect all required names to resolve and the runtime selection
to contain only `APP_BEARER_TOKEN`.
These commands may read the backend
and trigger its authentication or audit behavior.
Do not use `secretspec get`,
JSON export,
or `printenv` to inspect real values.
Use [provider diagnosis](diagnose-secretspec.md) for failures.

## Activate the value in Forge

After permission for the app and target environment,
follow [upload and deployment](use-forge-tooling.md#upload-runtime-values-then-deploy).
Storing a value in SecretSpec alone does not change a deployed function.

Source: [SecretSpec CLI reference](https://secretspec.dev/reference/cli/).
