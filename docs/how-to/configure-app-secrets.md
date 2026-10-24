# Bind app requirements and set runtime secrets

Use this guide for a Forge app
that already has Fence Rider package scripts.
Complete [user-provider setup](configure-user-providers.md) first.
Run commands from the app root.
Use an approved writable backend behind `project_secrets`
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
providers = ["shared_config"]

[profiles.default.FORGE_PRODUCT]
description = "Forge installation product"
default = "jira"
providers = ["shared_config"]

[profiles.default.FORGE_ENVIRONMENT]
description = "Forge deployment environment"
default = "development"
providers = ["shared_config"]

[profiles.default.APP_BEARER_TOKEN]
description = "Runtime bearer credential for approved API operators"
required = true
providers = ["project_secrets"]

[scopes.runtime]
secrets = ["APP_BEARER_TOKEN"]
```

`APP_BEARER_TOKEN` is an example name; substitute the name your app reads.
The declaration routes it through the operator's `project_secrets` binding,
not an implicit default provider. Keep secret values and developer-specific
vault identifiers out of the committed file. Never use a secret literal as a
declaration's `default`.

Choose only the [storage roles](../reference/forge-tooling.md#storage-roles)
the app needs. This example intentionally reuses Forge controls across projects
through `shared_config`. Route a project-specific target or service URL to
`project_config` instead; do not let shared defaults silently change production
targets. Use `shared_secrets` only for deliberately shared credentials with
explicitly shared backend addressing. Do not commit definitions of these aliases
in `[providers]`, where they would override user-global bindings.

Never add config as a secret fallback, for example
`providers = ["project_secrets", "project_config"]`. Any secret fallback must
preserve both sensitivity and sharing boundary. A missing alias needs operator
setup, not a plaintext fallback. Review the actual backend and its addressing:
the alias name does not enforce protection or project/profile isolation.

Keep storage separate from delivery. `providers` selects storage;
`runtime` selects uploads, not sensitivity. Keep local controls out of `runtime`;
Fence Rider refuses to upload them. Add other runtime names only when deployed
functions actually need them, including non-secret config if needed. A secret
needed only by local tooling stays out of `runtime`.
When an app needs manifest variables,
declare an optional `manifest` scope
and matching `environment.variables` in its Forge manifest;
do not assume the runtime scope configures the manifest.

## Store an existing credential

Run this yourself in a trusted terminal:

```sh
secretspec set --provider project_secrets --profile default APP_BEARER_TOKEN
```

Enter the credential at the prompt.
Match the explicit write destination to the committed read route; writing to a
different alias does not change normal app resolution.
This changes the selected backend,
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
  secretspec set --provider project_secrets --profile default \
    --from-file - APP_BEARER_TOKEN
```

The command generates 32 random bytes (256 bits)
represented as 64 hexadecimal characters,
removes the trailing newline,
and passes the exact bytes on stdin.
It neither prints the token nor places it in shell history or an argument.
It still writes wherever `project_secrets` points:
verify that alias before use.
`--from-file -` requires SecretSpec 0.21+.
If the pipeline fails, stop before uploading or deploying.

Do not regenerate on every deploy.
Rotating this bearer credential requires coordinating approved API clients;
an existing token stops working after its replacement becomes active.
Provision clients through an approved secret channel,
not a log or chat message.

## Validate without revealing the credential

```sh
SECRETSPEC_PROFILE=default secretspec check --scope '' --explain
SECRETSPEC_PROFILE=default secretspec check --scope runtime --json
SECRETSPEC_PROFILE=default bun run fence-rider doctor --resolve
```

Expect all required names to resolve and the example runtime selection
to contain only `APP_BEARER_TOKEN`.
These commands may read the backend
and trigger its authentication or audit behavior.
Review diagnostic output before sharing it; provider locations may be sensitive.
Do not use `secretspec get`,
value exports,
or `printenv` to inspect real values.

For unresolved names, check the selected profile and provider authentication.
Inspect alias locations without printing credentials:

```sh
secretspec config global provider list
```

For an existing app with older aliases, follow the
[migration steps](configure-user-providers.md#migrate-existing-aliases-without-rotating-credentials)
before provisioning again.

## Activate the value in Forge

After permission for the app and target environment,
follow [upload and deployment](runtime.md#upload-variables-and-deploy).
Storing a value in SecretSpec alone does not change a deployed function.
