# SecretSpec provider configuration for Forge tooling

This reference describes the provider layout used by the
[user setup](../how-to/configure-user-providers.md) and
[app setup](../how-to/configure-app-secrets.md) guides. Alias names are workflow
conventions, not reserved Fence Rider names. The
[variable contract](reference.md) defines command behavior and target rules;
[command help](command-help.md) contains the CLI options.

## Configuration ownership

| Location                           | Contents                                                                        | Runtime credential storage                |
| ---------------------------------- | ------------------------------------------------------------------------------- | ----------------------------------------- |
| `~/.config/secretspec/config.toml` | User defaults and `[defaults.providers]` aliases                                | No                                        |
| File selected by `user_dotenv`     | Non-secret target controls shared across apps                                   | Not used for credentials in this workflow |
| App's `secretspec.toml`            | Project, profiles, declarations, routes, scopes, optional `[providers]` aliases | No secret literals                        |
| Backend selected by `app_secrets`  | App credential values                                                           | Yes                                       |
| Forge runtime variable store       | Uploaded encrypted runtime members                                              | Yes                                       |

The user configuration location follows platform/XDG configuration resolution.
Dotenv paths beginning with `~` require SecretSpec 0.18+; exact stdin input
through `set --from-file -` requires 0.21+.

## Provider selection and identity

Global aliases use `[defaults.providers]`; project aliases use `[providers]`
and take precedence on name conflict. Per-secret routes and profile defaults
can override the user's default provider. Scope membership selects destinations,
not a storage backend or an authorization grant.

SecretSpec 0.21.1's `config global init --provider` accepts backend names, not
aliases such as `app_secrets`. Keyring values are namespaced by project,
profile, and key. Other backends have their own storage models. Changing a
project or profile name can therefore change the lookup location. A SecretSpec
profile and a Forge environment are independent selectors.

## Guide example routes

| Name                | Provider route                       | Purpose                                                  |
| ------------------- | ------------------------------------ | -------------------------------------------------------- |
| `FORGE_SITE`        | `user_dotenv`                        | Installation site hostname; never uploaded               |
| `FORGE_PRODUCT`     | `user_dotenv`; default `jira`        | Installation product; never uploaded                     |
| `FORGE_ENVIRONMENT` | `user_dotenv`; default `development` | Forge target; never uploaded                             |
| `APP_BEARER_TOKEN`  | `app_secrets`                        | Example runtime credential selected by the runtime scope |

`APP_BEARER_TOKEN` is an example app name, not a required Fence Rider variable.
The canonical [script example](../examples/package.json) is independent of app
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
`secretspec get` and `export` can reveal values. Forge and child-process output
are not automatically redacted.

## Upstream contracts

- [SecretSpec configuration](https://secretspec.dev/reference/configuration/)
- [SecretSpec CLI](https://secretspec.dev/reference/cli/)
