# Why SecretSpec and Fence Rider belong together

## Secret files are convenient, but discoverable

A `.env` file is an easy way to supply application credentials. Ignoring it in
Git prevents an ordinary commit, but does not prevent a filesystem search, a
debugging tool, or a coding agent from reading it. Moving the file outside the
repository reduces accidental discovery without restricting a process that can
read that directory.

A secret manager can reduce that exposure: credentials need not be copied into
project files, shell history, or generated configuration. SecretSpec lets the
repository declare what an app needs while each developer chooses where the
values come from. The [provider setup guide](../how-to/configure-user-providers.md)
uses a keyring for credentials and a separate dotenv file for non-secret target
settings. Fence Rider also supports dotenv for credentials; avoiding plaintext
storage is a choice of workflow, not a restriction enforced by the tool.

## Shared requirements do not require a shared secret manager

A sample app's authors and downstream developers may use different providers.
Binding the app to one vault would make that organizational choice a dependency
of every fork. Copying credentials into the repository would create a different
problem: each copy would need protection and rotation.

SecretSpec separates those decisions. A committed `secretspec.toml` describes
names, requirements, and provider routes without holding credential values.
The [provider convention](../reference/forge-tooling.md#storage-roles) names
roles rather than products: `shared_config`, `project_config`,
`shared_secrets`, and `project_secrets`. User-level bindings map those roles to
a developer's backends. The app can share a configuration contract without
sharing a vault identifier or a secret.

Not every value needs secret storage. `FORGE_SITE`, `FORGE_PRODUCT`, and
`FORGE_ENVIRONMENT` are non-secret target controls, so `shared_config` can bind
them to a shared user dotenv file without holding app credentials. Sharing is
intentional, not a consequence of being local to the tooling: a production
target can instead use `project_config` so other apps' defaults cannot change it.
Likewise, storing a secret in a remote vault does not make it shared.

Config must be safe for the chosen plaintext storage, but need not be public.
Secret roles require approved secret backends. Aliases cannot enforce either
protection or isolation: backend addressing and permissions must establish the
project/profile boundary or deliberate cross-project sharing. A vault whose
bootstrap credential is exposed in plaintext does not solve that problem.

## Forge delivery is a separate concern

SecretSpec resolves values into a local process. It does not select which
values belong in Forge's runtime store or perform an encrypted upload. Forge's
[three variable destinations](three-kinds-of-env-vars.md) have distinct delivery
mechanisms even when they share a source.

Fence Rider supplies that Forge-specific boundary while leaving provider
syntax, authentication, profiles, and inheritance to SecretSpec. Upload
selection is explicit, and every runtime upload requests encryption. Deployment
is a separate operation so an ordinary code change need not rewrite credentials.
The package script still owns ordering, consent, and the target environment;
Fence Rider does not grant approval merely by generating a command.

## Less exposure is not isolation

Avoiding a plaintext file does not sandbox an agent. A process authorized to
invoke the provider or inspect another process may still obtain credentials.
Provider approval, short-lived credentials, restricted agent permissions, and
operator-controlled access remain important.

The values also have to reach their consumers. Forge receives upload values as
process arguments, which can be inspected locally. Forge output and application
logs are not automatically redacted. Encrypted remote storage does not make a
value safe to log or return to a browser, nor does it hide it from the platform.

Fence Rider is development tooling, not a runtime secret service. It is not
included in deployed functions and does not intercept their `process.env`
access. Its value is reducing repeated configuration and avoidable exposure,
not preventing every authorized process from revealing a value it receives.

## Related material

- [Configure user providers](../how-to/configure-user-providers.md)
- [Declare app requirements and store credentials](../how-to/configure-app-secrets.md)
- [Run configured Forge workflows](../how-to/use-forge-tooling.md)
- [Product responsibilities and limits](scope-and-boundaries.md)
