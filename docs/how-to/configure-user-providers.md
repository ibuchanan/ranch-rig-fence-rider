# Configure shared user settings and secret providers

Use this guide to configure one workstation for multiple Forge apps.
Apps declare storage roles; you bind those roles to suitable backends.
The example needs only `shared_config` for non-secret settings and
`project_secrets` for project/profile-isolated credentials. See the
[four storage roles](../reference/forge-tooling.md#storage-roles) for the full
convention. Alias names do not enforce backend safety or isolation.

## Configure the required aliases

1. Locate your SecretSpec user configuration, normally
   `~/.config/secretspec/config.toml`. Account for platform/XDG overrides.
   Inspect existing aliases before editing:

   ```sh
   secretspec config global provider list
   ```

   Provider locations can be sensitive; review the output before sharing it.
   Merge entries rather than replacing an existing file or its defaults.

2. For the normal configuration location, create the directory if needed:

   ```sh
   mkdir -p ~/.config/secretspec
   ```

3. Add missing aliases using SecretSpec's CLI:

   ```sh
   secretspec config global provider add shared_config \
     'dotenv:~/.config/secretspec/user.env'
   secretspec config global provider add project_secrets \
     'keyring://'
   ```

   For existing aliases, review and edit their bindings in the user file
   instead of blindly replacing them. These settings affect all participating
   projects, not just the current repository.

   `keyring://` is illustrative, not approved for every organization. Select an
   approved writable vault if required; configure authentication and reference
   templates using [SecretSpec's provider documentation][providers]. Verify
   project/profile/key isolation before writing. Keep personal vault coordinates
   and bootstrap credentials out of repositories and plaintext configuration.

   The resulting entries are:

   ```toml
   [defaults.providers]
   shared_config = "dotenv:~/.config/secretspec/user.env"
   project_secrets = "keyring://"
   ```

   Requirements and explicit read routes belong in each app's
   `secretspec.toml`; values belong in the bound backends. Do not commit
   definitions of these aliases in the project's `[providers]` table, which
   would override user-global bindings.

4. Restrict file access, using your actual configuration location:

   ```sh
   chmod 700 ~/.config/secretspec
   chmod 600 ~/.config/secretspec/config.toml
   ```

For a first-time setup only, `secretspec config global init --provider keyring
--profile default` can set global defaults. Skip it when preserving existing
defaults. SecretSpec 0.21.1 accepts backend names here, not aliases such as
`project_secrets`. Keep an approved secret backend as the default for
credentials without a route, but still give each relevant app value an explicit
semantic route.

## Set shared Forge controls

Add the declarations from
[app setup](configure-app-secrets.md#declare-requirements-not-values) to the
app's `secretspec.toml`. From that app's repository root:

```sh
secretspec set --provider shared_config --profile default FORGE_SITE
secretspec set --provider shared_config --profile default FORGE_PRODUCT
secretspec set --provider shared_config --profile default FORGE_ENVIRONMENT
chmod 600 ~/.config/secretspec/user.env
```

Enter the intended hostname, product, and environment at the prompts; for
example, `example.atlassian.net`, `jira`, and `development`. Do not enter a token.
The file is plaintext and is only for non-secret config. Config need not be
suitable for public disclosure merely because plaintext storage is acceptable.

Other participating projects reuse the alias and file, not a copied set of
values. Sharing `FORGE_ENVIRONMENT` changes all their default targets; keep
production targeting explicit. Each workstation and CI runner needs its own
operator-owned bindings.

## Isolate project-specific config

When an app needs a service URL or target that must not follow shared defaults,
add the `project_config` binding to your user configuration:

```sh
secretspec config global provider add project_config 'dotenv:.env'
```

Verify that `.env` resolves to a distinct file for each consuming project in
the actual invocation context, and ignore it in Git before storing private
config. Use an absolute project-specific path or a different backend if needed.
Route that value to `providers = ["project_config"]` in the app declaration,
then provision it from the app root with `secretspec set --provider
project_config --profile default NAME`. Match the explicit write destination to
the committed read route.

## Bind a different approved secret provider

Keep the alias name `project_secrets`, but edit its binding to your approved
read/write provider. Follow its instructions for authentication, record naming,
project/profile isolation, and write permission. Keyring's default addressing
includes project, profile, and key; another backend may need reference templates
to achieve the same isolation. A new alias alone creates no namespace.

Configure `shared_secrets` only when credentials must deliberately be reused
across projects. Give it explicitly shared backend addressing and suitable
permissions; pointing it at the same vault as `project_secrets` does not by
itself remove a project namespace.

SecretSpec supports binding a provider's `config` credential to another
provider and `secretspec config provider login` for credential setup. Follow the
backend's native mechanisms. Do not use an exposed plaintext `config_file` as a
workaround: bootstrap credentials are secrets too. Never fall back from a
secret role to a config role to fix resolution.

## Verify aliases without displaying values

From the consuming app root:

```sh
secretspec config global provider list
SECRETSPEC_PROFILE=default secretspec check --explain --scope ''
```

The check may access a provider, request authentication, and create audit
records; the trace does not print stored values. Missing values may be expected
until completing [app configuration](configure-app-secrets.md). An undefined
alias needs operator setup, not a plaintext fallback or blanket
`SECRETSPEC_PROVIDER` override for a mixed config-and-secrets profile.

## Migrate existing aliases without rotating credentials

For an app using `user_dotenv` and `app_secrets` or an implicit secret default:
1. Bind `shared_config` to the existing non-secret settings backend.
2. Bind `project_secrets` to the approved secret backend and verify its
   project/profile addressing.
3. Change committed control routes from `user_dotenv` to `shared_config` and
   credential routes from `app_secrets` or an implicit default to
   `project_secrets`. Do not change project or profile names just to rename a
   route.
4. Confirm existing values resolve with the value-free checks above before
   writing anything. Alias-specific references or different backend coordinates
   may need a controlled migration; renaming an alias does not prove the address
   stayed the same.
5. Update app provisioning instructions and CI bindings. Remove old aliases only
   after checking their other consumers. Do not regenerate credentials or upload
   to Forge merely because alias names changed.

[providers]: https://secretspec.dev/reference/providers/
