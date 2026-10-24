# Configure shared user settings and a secret provider

Use this guide to configure one workstation for multiple Forge apps,
covering shared configuration (not secrets),
and your own secrets manager.

The examples below favor the use of the `secretspec` CLI for safe edits.
However, the same configuration can be written and confirmed in your favorite editor.

## Create the user configuration

1. Create the configuration directory if it does not exist:

   ```sh
   mkdir -p ~/.config/secretspec
   ```

2. Configure SecretSpec's global settings:

   ```sh
   secretspec config global provider add user_dotenv \
     'dotenv:~/.config/secretspec/user.env'
   secretspec config global provider add app_secrets \
     'keyring://'
   secretspec config global init \
     --provider keyring \
     --profile default
   ```

   These commands change user-wide settings,
   not just a target repository.
   Choose the default deliberately if other projects already depend on it.

   `app_secrets` uses the OS keyring in this example.
   Select an approved vault instead if required by your environment;
   configure its authentication using [SecretSpec's provider documentation][providers].
   Do not put credentials in provider URIs or in this file.
   A keyring stores encrypted local data;
   it is not a guarantee of hardware-backed or non-exportable storage.

   That should have created `~/.config/secretspec/config.toml` with the following:

   ```toml
   [defaults]
   provider = "keyring"
   profile = "default"

   [defaults.providers]
   user_dotenv = "dotenv:~/.config/secretspec/user.env"
   app_secrets = "keyring://"
   ```

   Requirements for variables belong in each app's `secretspec.toml`;
   values belong in the selected providers.
   Global aliases use `[defaults.providers]`;
   project aliases use `[providers]`.

3. Restrict file access:

   ```sh
   chmod 700 ~/.config/secretspec
   chmod 600 ~/.config/secretspec/config.toml
   ```

## Set shared Forge controls

After creating the aliases above, add the declarations from
[app setup](configure-app-secrets.md#declare-requirements-not-values) to the
app's `secretspec.toml`. Then, from that app's repository root:

```sh
secretspec set --provider user_dotenv --profile default FORGE_SITE
secretspec set --provider user_dotenv --profile default FORGE_PRODUCT
secretspec set --provider user_dotenv --profile default FORGE_ENVIRONMENT
chmod 600 ~/.config/secretspec/user.env
```

Enter the intended site hostname, product, and environment at the prompts.
For example, use `example.atlassian.net`, `jira`, and `development`
for a development installation.
Do not enter a token.
This file is plaintext
and is only for non-secret controls.
Sharing `FORGE_ENVIRONMENT` changes the default target of all participating apps;
keep production targeting explicit.

You only set these values once.
The app declarations route these controls to `user_dotenv`,
regardless of the user's default provider.
Other participating projects reuse the alias and file,
not a copied set of values.
Each workstation and CI runner needs its own alias configuration.

## Bind a different approved secret provider

Keep the alias name `app_secrets`,
but change its URI to your approved read/write provider.
Follow that backend's instructions for
authentication,
record naming,
project/profile isolation,
and write permission
before setting anything.
The keyring backend isolates values by project, profile, and key;
do not assume another backend has the same storage model.

SecretSpec supports binding
the provider's `config` credential to another provider
and `secretspec config provider login` for credential setup;
see the SecretSpec documentation.
Do not use a plaintext `config_file` as a workaround for this workflow's
no-plaintext-secrets goal.

Keep a built-in secret backend such as `keyring`,
not a plaintext dotenv backend,
as the global default for declarations without an explicit route.
SecretSpec 0.21.1's `config global init --provider` accepts backend names,
not aliases such as `app_secrets`.
Route runtime declarations explicitly to the `app_secrets` alias
as in the [app configuration guide](configure-app-secrets.md).

## Verify aliases without displaying values

```sh
secretspec config global provider list
SECRETSPEC_PROFILE=default secretspec check --explain --scope ''
```

The alias list shows provider locations,
not stored values.
Do not publish it if the locations themselves are sensitive.
The check may access a vault or request authentication;
the resolution trace does not print secret values.
Missing variables may be expected until completing
[app configuration](configure-app-secrets.md).

[providers]: https://secretspec.dev/reference/providers/
