# Semantic provider conventions for SecretSpec

Status: proposed convention for Fence Rider consumers. These names are a
configuration contract, not built-in SecretSpec providers or an implemented
Fence Rider security policy.

## Name the storage role, not the backend

Committed `secretspec.toml` files should express the storage role required by
each value. Developers and CI operators bind those roles to suitable backends
in their own SecretSpec configuration.

Use two independent dimensions:

- **Sharing boundary:** `shared` across participating projects, or isolated to
  one `project`.
- **Sensitivity:** non-secret `config`, or confidential `secrets` requiring an
  approved secret backend.

| Alias | Contract | Examples |
| --- | --- | --- |
| `shared_config` | Non-secret settings intentionally reused across projects | Preferred Forge site, default product |
| `project_config` | Non-secret settings specific to the consuming project | Service URL, project-specific target |
| `shared_secrets` | Credentials deliberately shared across projects | Personal service credential used by several tools |
| `project_secrets` | Credentials isolated by project and profile | An app's API bearer token |

Prefer `shared` and `project` over `global` and `local`. All four aliases can
be defined in user-global configuration, even when their values must remain
project-specific. A secret may live in a remote vault or a local encrypted
keychain; neither location alone determines its sharing boundary.

Do not require all four aliases in every app. Declare only the roles the app
actually uses. Backend names such as `keeper`, `keyring`, and `dotenv` remain
useful for provider administration, but should not be the portable contract in
application declarations.

## Repository-owned declarations

Select a semantic alias explicitly for every relevant value. Do not depend on
a developer's default provider to keep credentials out of plaintext storage.
Do not commit definitions of these aliases in the project's `[providers]`
table: project definitions override same-named user-global aliases.

For example, this Forge app needs only `shared_config` and `project_secrets`:

```toml
[project]
name = "explore-forge-json-rpc-backbone"
revision = "1.0"

[profiles.default.FORGE_SITE]
description = "Forge installation site hostname"
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

[profiles.default.RPC_BEARER_SECRET]
description = "Bearer credential for this app's API operators"
required = true
providers = ["project_secrets"]

[scopes.runtime]
secrets = ["RPC_BEARER_SECRET"]
```

A shared Forge environment is a convenience, not a requirement. Use
`project_config` instead when a target must not change with other projects'
defaults. Sharing a value must be an intentional choice, especially for
production targets.

## Operator-owned bindings

Define the aliases in the user configuration, normally
`~/.config/secretspec/config.toml`. Merge entries rather than overwriting an
existing file. Account for platform/XDG configuration directory overrides.

```toml
[defaults.providers]
shared_config = "dotenv:~/.config/secretspec/user.env"
project_config = "dotenv:.env"
project_secrets = "keyring://"
```

The filenames are examples. An existing user settings file can be reused.
The `project_config` path must resolve to a distinct file for each consuming
project; check backend path resolution in the actual invocation context.

`keyring://` is an illustrative secret backend, not a declaration that it is
approved for every organization. Another operator can bind `project_secrets`
to an approved vault without changing application declarations. Configure
provider authentication and any reference templates using SecretSpec's native
mechanisms; keep personal vault coordinates and bootstrap credentials out of
the repository.

Define `shared_secrets` only when it is needed. Configure explicitly shared
backend addressing rather than assuming that mapping it to the same vault as
`project_secrets` changes its namespace.

## Security and isolation rules

1. **Config may be plaintext; secrets require an approved backend.** Config
   means safe for the chosen plaintext storage, not necessarily suitable for
   public disclosure. Moving a bearer token into a home-directory dotenv file
   does not make it config.
2. **No secret-to-config fallback.** Do not use a route such as
   `providers = ["project_secrets", "project_config"]`. Any fallback for a
   secret must satisfy the same sensitivity and sharing contract.
3. **Aliases do not create isolation.** The backend and its addressing must
   enforce the intended namespace. The default keyring convention includes
   project, profile, and key. Verify equivalent addressing when selecting a
   vault; use provider-specific reference templates where appropriate.
4. **Sharing must be explicit.** `shared_secrets` needs intentionally shared
   addressing and suitable permissions. A shared alias name does not by itself
   remove a backend's project namespace.
5. **Keep storage separate from delivery.** `providers` selects storage;
   `runtime` selects Forge uploads; `manifest` selects manifest consistency
   checks. A secret may remain local, and non-secret config may be needed by
   deployed code. Do not infer scope membership from an alias name.
6. **Do not weaken the contract to fix resolution.** An undefined alias should
   lead to operator setup, not a checked-in plaintext fallback. Avoid blanket
   provider overrides that redirect a mixed config-and-secrets profile.
7. **Treat bootstrap credentials as secrets.** A vault backed by an exposed
   plaintext client credential does not achieve the intended protection.
8. **Naming is not enforcement.** SecretSpec can resolve `project_secrets`
   incorrectly bound to dotenv. Binding review or a separate backend-aware
   policy check is needed to enforce the convention. No such enforcement is
   claimed here. SecretSpec is also not a sandbox against a process authorized
   to retrieve values.

## Provisioning and diagnosis

After configuring the aliases, run provisioning commands from the consuming
project's root. Enter credentials at the prompt in a trusted terminal:

```sh
secretspec set --provider shared_config --profile default FORGE_SITE
secretspec set --provider project_secrets --profile default RPC_BEARER_SECRET
```

The explicit write destination agrees with the committed read route. A manual
write to another alias does not change the app's normal resolution route.

Inspect aliases and resolution without printing stored values:

```sh
secretspec config global provider list
secretspec check --profile default --scope '' --explain
```

Provider URIs can contain sensitive metadata; do not publish diagnostic output
without review. Resolution can access providers, request authentication, and
create audit records. Avoid `get`, value exports, and environment dumps when
diagnosing real credentials.

## Adopting the convention

For an app currently using `user_dotenv` and an implicit secret default:

1. Bind `shared_config` to the existing non-secret user settings backend.
2. Bind `project_secrets` to the intended approved secret backend and verify
   its project/profile addressing.
3. Update committed control routes from `user_dotenv` to `shared_config`, and
   give runtime credentials an explicit `project_secrets` route.
4. Confirm existing values resolve before writing anything. Alias-specific
   references or different backend coordinates may require a controlled
   migration; renaming an alias is not proof that data stayed at the same
   address.
5. Update app-specific provisioning instructions and CI bindings. Do not
   regenerate credentials or upload to Forge merely because aliases changed.

This proposal does not change any application declaration, user configuration,
provider binding, stored credential, or remote Forge state.

## Sources

- [SecretSpec provider aliases and routes](https://secretspec.dev/concepts/providers/)
- [Provider-specific references](https://secretspec.dev/concepts/references/)
- [Keyring storage conventions](https://secretspec.dev/providers/keyring/)
- [Fence Rider configuration contracts](https://github.com/ibuchanan/ranch-rig-fence-rider/blob/main/docs/reference/reference.md)
