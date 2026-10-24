# Validate and manage a configured Forge installation

Use the package scripts from the [installation guide](installation.md#add-the-full-script-set)
with a registered app and a site, product, and environment you are authorized to
change. Complete [provider setup](configure-user-providers.md) and
[app configuration](configure-app-secrets.md) first. Run commands from the app
root. Scripted consent flags are not permission to run them.

## Validate before remote changes

```sh
bun run fence-rider doctor --resolve && bun run lint:forge
```

Fix failed checks before continuing. `doctor --resolve` reports unresolved
required names without printing values; native scope checks may access providers.
Lint resolves the whole profile before Forge starts, including required runtime
credentials. For a provider failure, verify the selected file, profile, alias,
and backend authentication using the [setup guide](configure-user-providers.md#verify-aliases-without-displaying-values).
Do not diagnose it by printing credentials.

## Install after deployment

1. Set the environment, site, and product in your active profile following
   [local target selection](local.md).
2. [Upload changed runtime values and deploy](runtime.md#upload-variables-and-deploy)
   to that environment.
3. Install on the configured site and product:

   ```sh
   bun run install:forge
   ```

The example script includes `--confirm-scopes --non-interactive`; review the
requested permissions before execution. To override an authorized installation
target, append Forge options to the package script:

```sh
bun run install:forge --environment development \
  --site example.atlassian.net --product jira
```

The script still requires valid profile-derived defaults before passing those
overrides to Forge. A missing site or product cannot be repaired by an appended
option; set it in the profile first.

## Upgrade an existing installation

After a scope or egress change, deploy to the installation's environment, then:

```sh
bun run upgrade:forge
```

This script adds `--upgrade` to the installation options. Do not uninstall and
reinstall merely to apply a permission change.

## Remove an installation

Verify removal authorization and the profile's environment, site, and product,
then run:

```sh
bun run uninstall:forge
```

A matched target can be removed directly; do not rely on a confirmation prompt.
Forge CLI 14.2.0 has no uninstall `--non-interactive` option. Fence Rider adds
neither a confirmation bypass nor a guarantee that Forge will prompt.

## Other configured tasks

- [Select a profile or file](local.md#select-a-file-or-profile).
- [Upload variables and deploy](runtime.md#upload-variables-and-deploy).
- [Tunnel during development](runtime.md#tunnel-during-development).
- [Deploy in CI](runtime.md#deploy-in-ci-with-existing-authentication).
- [Recover from a partial upload](runtime.md#recover-from-a-partial-upload).

For provider operations such as login, alias configuration, and setting values,
use SecretSpec directly. Use raw Forge for operations Fence Rider does not
cover, such as authentication or logs. Run only trusted child processes with a
resolved secret environment; do not inject the full profile into a coding-agent
session or a command that prints its environment.
