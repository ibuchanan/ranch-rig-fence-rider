# SecretSpec and Forge tooling reference

## Configuration ownership

| Location                                     | Contents                                                                                              | Storage of runtime secret values |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------- | -------------------------------- |
| `~/.config/secretspec/config.toml`           | User defaults and `[defaults.providers]` alias definitions                                            | No                               |
| User's dotenv file selected by `user_dotenv` | Non-secret Forge controls shared across apps                                                          | Not permitted by this workflow   |
| App's `secretspec.toml`                      | Project name, profiles, requirement metadata, provider routes, scopes; optional project `[providers]` | No                               |
| Backend selected by `app_secrets`            | App credential values                                                                                 | Yes; approved backend required   |
| Forge runtime variable store                 | Explicitly uploaded encrypted runtime members                                                         | Yes                              |

The user configuration location is subject to platform/XDG configuration
resolution. Dotenv paths beginning with `~` require SecretSpec 0.18+; exact stdin
input through `set --from-file -` requires 0.21+.

Global aliases use `[defaults.providers]`. Project aliases use `[providers]`
and win on name conflict. Per-secret routes and profile-level provider defaults
can override a user's default route. Scope membership is selection, not a
storage backend or an authorization grant.

## App names and destinations

| Name                | Declaration route                                        | Local use                                 | Runtime upload  |
| ------------------- | -------------------------------------------------------- | ----------------------------------------- | --------------- |
| `FORGE_SITE`        | `user_dotenv`                                            | Installation site hostname                | Never           |
| `FORGE_PRODUCT`     | `user_dotenv`; default `jira`                            | Installation product                      | Never           |
| `FORGE_ENVIRONMENT` | `user_dotenv`; default `development`                     | Forge target                              | Never           |
| `RPC_BEARER_SECRET` | Current app: user default; guide: explicit `app_secrets` | Profile validation and approved processes | `runtime` scope |

Keyring values are namespaced by project, profile, and key. Changing these can
change the lookup location. Backend-specific storage behavior remains
SecretSpec's responsibility. A SecretSpec profile and a Forge environment are
independent selectors.

## Package script effects

| Script                | Effect                                                     | Targets and policy                                                                         |
| --------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `lint:forge`          | Local Forge lint under full-profile SecretSpec injection   | No environment/site/product flags injected                                                 |
| `forge:variables:set` | Resolves profile and uploads runtime members encrypted     | Explicit wrapper `--environment`, else resolved control, else `development`; no Forge tail |
| `forge:deploy`        | Runs generated Forge deployment script; no variable upload | Injects environment; includes `--non-interactive`                                          |
| `forge:install`       | Installs configured app                                    | Environment/site/product; `--confirm-scopes --non-interactive`                             |
| `forge:upgrade`       | Upgrades existing installation                             | Install behavior plus `--upgrade`                                                          |
| `forge:uninstall`     | Removes installation                                       | Environment/site/product; no non-interactive flag                                          |
| `forge:register`      | Calls Forge directly; creates app identity                 | No SecretSpec wrapper                                                                      |

Fence Rider's script-producing commands print POSIX shell. The package scripts
execute it with `cmd=$(...) && sh -c "$cmd" sh`. A generation failure stops
execution. Arguments appended to those package scripts become the generated
script's positional arguments and reach Forge without another shell parse.
`variables` instead performs uploads directly. No tunnel script currently
exists in this app.

## Diagnostics

| Command                                   | Result                                         | Secret/provider access                                                  |
| ----------------------------------------- | ---------------------------------------------- | ----------------------------------------------------------------------- |
| `secretspec schema`                       | Declaration schema                             | No resolved values                                                      |
| `secretspec config global provider list`  | User alias locations                           | No stored values; URIs may contain sensitive metadata                   |
| `secretspec check --scope '' --explain`   | Full-profile resolution trace                  | May access providers; no values printed                                 |
| `secretspec check --scope runtime --json` | Runtime resolution report                      | May access providers; no values printed                                 |
| `bun run fence-rider doctor`              | Tools, schema, scopes, ambient-shadowing names | No full-profile resolve check; native scope checks may access providers |
| `bun run fence-rider doctor --resolve`    | Adds required-value resolution check           | Provider access possible; no values printed                             |

`secretspec get` and `export` can reveal values. Forge and child-process output
is not automatically redacted. Missing required profile values block all
configured workflows. Local controls in `runtime`, empty uploads, and
leading-dash upload values are refused. Uploads are not transactional and do
not remove previously stored remote values when an optional name is absent.

## Upstream contracts

- [SecretSpec configuration](https://secretspec.dev/reference/configuration/)
- [SecretSpec CLI](https://secretspec.dev/reference/cli/)
- [Fence Rider](https://github.com/ibuchanan/ranch-rig-fence-rider)
- [Validation evidence and limits](secretspec-validation.md)
