# SecretSpec provider configuration for Forge tooling

This reference defines the semantic provider convention used by the
[user setup](../how-to/configure-user-providers.md) and
[app setup](../how-to/configure-app-secrets.md) guides. These aliases are a
configuration contract, not built-in SecretSpec providers, reserved Fence Rider
names, or an enforced backend security policy. The
[variable contract](reference.md) defines command behavior and target rules;
[command help](command-help.md) contains the CLI options.

## Storage roles

Aliases describe two independent dimensions: sharing boundary and sensitivity.

| Alias             | Sharing boundary                                   | Sensitivity                                    | Examples                                          |
| ----------------- | -------------------------------------------------- | ---------------------------------------------- | ------------------------------------------------- |
| `shared_config`   | Intentionally reused across participating projects | Non-secret config                              | Preferred Forge site, default product             |
| `project_config`  | Isolated to one project                            | Non-secret config                              | Service URL, project-specific target              |
| `shared_secrets`  | Deliberately shared across projects                | Confidential; approved secret backend required | Personal service credential used by several tools |
| `project_secrets` | Isolated by project and profile                    | Confidential; approved secret backend required | An app's API bearer token                         |

Only roles used by the app need bindings. `shared` and `project` describe the
sharing boundary, not the location of the configuration file or backend.
All four aliases can be defined in user-global configuration. A local keyring
can hold project secrets; a remote vault can hold shared secrets.

Config is safe for the chosen plaintext storage, not necessarily for public
disclosure. Moving a credential into a home-directory dotenv file does not
make it config. Backend names such as `keyring`, `keeper`, and `dotenv` remain
provider administration details, not the portable app contract.

## Configuration ownership

| Location                                                    | Contents                                                          | Credential storage                               |
| ----------------------------------------------------------- | ----------------------------------------------------------------- | ------------------------------------------------ |
| `~/.config/secretspec/config.toml`                          | Operator-owned defaults and `[defaults.providers]` bindings       | No exposed bootstrap credentials                 |
| Backend selected by `shared_config`                         | Non-secret settings reused across apps                            | No                                               |
| Backend selected by `project_config`                        | Non-secret settings isolated to one project                       | No                                               |
| App's `secretspec.toml`                                     | Project, profiles, declarations, explicit provider routes, scopes | No secret literals or personal vault coordinates |
| Backends selected by `shared_secrets` and `project_secrets` | Credential values with the declared sharing boundary              | Yes; approved backends only                      |
| Forge runtime variable store                                | Uploaded encrypted runtime members                                | Yes                                              |

The user configuration location follows platform/XDG configuration resolution.
Global aliases use `[defaults.providers]`; project aliases use `[providers]`
and take precedence on name conflict. The convention leaves these semantic
alias definitions out of committed project `[providers]` tables so they do not
override operator-owned bindings. Explicit per-value routes avoid relying on
the user's default provider for credential safety.

The guides use this operator-owned binding example:

```toml
[defaults.providers]
shared_config = "dotenv:~/.config/secretspec/user.env"
project_secrets = "keyring://"
```

An app that also needs project-specific config can use
`project_config = "dotenv:.env"`. That path must resolve to a distinct file for
each consuming project in the actual invocation context. The filename is not
part of the contract. `shared_secrets` is omitted until deliberately needed;
it requires explicitly shared backend addressing and suitable permissions.

Dotenv paths beginning with `~` require SecretSpec 0.18+; exact stdin input
through `set --from-file -` requires 0.21+. SecretSpec 0.21.1's
`config global init --provider` accepts backend names, not semantic aliases.

## Security and isolation contract

- Config may be plaintext; secrets require an approved backend. `keyring://`
  is illustrative, not universally approved. A keyring does not guarantee
  hardware-backed or non-exportable storage.
- No secret-to-config fallback: a route such as
  `providers = ["project_secrets", "project_config"]` violates the contract.
  Any fallback must preserve both sensitivity and sharing boundary.
- Aliases do not create isolation. Keyring's default addressing includes
  project, profile, and key. Other backends need equivalent addressing, using
  provider-specific reference templates where appropriate. Binding two aliases
  to the same vault does not make one shared and the other project-isolated.
- Changing a project, profile, alias-specific reference, or backend coordinate
  can change the lookup location. A SecretSpec profile and a Forge environment
  are independent selectors.
- Undefined aliases require operator setup, not a checked-in plaintext fallback
  or a blanket provider override for a mixed config-and-secrets profile.
- Provider authentication and reference templates belong in operator-owned
  SecretSpec configuration. Bootstrap credentials are secrets too; an exposed
  plaintext vault credential defeats the intended protection.
- Naming is not enforcement: SecretSpec can resolve `project_secrets` bound to
  dotenv. Binding review or a separate backend-aware policy check is required;
  Fence Rider does not perform that check or sandbox authorized processes.

## Storage and delivery are independent

`providers` selects storage. The `runtime` scope selects encrypted Forge
uploads; the optional `manifest` scope selects declaration consistency checks.
Neither sensitivity nor scope membership is inferred from a provider alias.
A secret may remain local, and non-secret config may be needed by deployed code.
The native scope member list is called `secrets` even when it includes config.
Scopes are not backend authorization grants.

## Guide example routes

| Name                | Provider route                         | Purpose                                                  |
| ------------------- | -------------------------------------- | -------------------------------------------------------- |
| `FORGE_SITE`        | `shared_config`                        | Installation site hostname; never uploaded               |
| `FORGE_PRODUCT`     | `shared_config`; default `jira`        | Installation product; never uploaded                     |
| `FORGE_ENVIRONMENT` | `shared_config`; default `development` | Forge target; never uploaded                             |
| `APP_BEARER_TOKEN`  | `project_secrets`                      | Example runtime credential selected by the runtime scope |

Sharing controls is intentional in these examples. A target that must not
follow other projects' defaults uses `project_config` instead, especially for
production. `APP_BEARER_TOKEN` is an example app name, not a required Fence Rider
variable. The [script example](../examples/package.json) is independent of app
credential names and provider choices.

## Value-free diagnostic interfaces

| Command                                   | Report                        | Provider access                              |
| ----------------------------------------- | ----------------------------- | -------------------------------------------- |
| `secretspec schema`                       | Declaration schema            | No resolved values                           |
| `secretspec config global provider list`  | User alias locations          | No stored values; locations may be sensitive |
| `secretspec check --scope '' --explain`   | Full-profile resolution trace | May access providers; no values printed      |
| `secretspec check --scope runtime --json` | Runtime resolution report     | May access providers; no values printed      |

Fence Rider's diagnostic checks and exit status are specified in the
[installation reference](installation.md#secretspec-and-forge-are-prerequisites).
Resolution can request authentication and create audit records. Provider URIs
can contain sensitive metadata; diagnostic output needs review before sharing.
`secretspec get`, value exports, and environment dumps can reveal values. Forge
and child-process output are not automatically redacted.

## Sources

- [Semantic provider convention proposal](../../specs/secretspec-provider-conventions.md)
- [SecretSpec providers and routes](https://secretspec.dev/concepts/providers/)
- [Provider-specific references](https://secretspec.dev/concepts/references/)
- [Keyring storage conventions](https://secretspec.dev/providers/keyring/)
- [SecretSpec configuration](https://secretspec.dev/reference/configuration/)
- [SecretSpec CLI](https://secretspec.dev/reference/cli/)
