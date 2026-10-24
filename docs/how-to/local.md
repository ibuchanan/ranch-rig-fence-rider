# Set local values for tooling and targets

Use this guide to choose the Forge environment, site and product that Fence
Rider's workflows target, and to select which SecretSpec file and profile
supplies them. These values stay on your machine: they are never uploaded.

Before you start, finish the [installation guide](installation.md) so
`fence-rider` is on `PATH`, and use an app and site you are authorized to
change.

## Declare the targets

1. In the active profile of `secretspec.toml`, declare the controls you need.
   Only `FORGE_ENVIRONMENT` falls back to `development` when it is absent:

   ```toml
   FORGE_ENVIRONMENT = { description = "Deployment target", default = "development" }
   FORGE_SITE = { description = "Installation site", default = "example.atlassian.net" }
   FORGE_PRODUCT = { description = "Installation product", default = "jira" }
   ```

2. Keep these names out of `[scopes.runtime]`; selecting a control for upload
   fails before any write.
3. Supply real values through your provider. For a disposable exercise, a
   dotenv file works:

   ```sh
   SECRETSPEC_PROVIDER=dotenv:values.env bun run fence-rider doctor
   ```

   Add `values.env` to `.gitignore` before you create it, and never commit
   real credentials.

## Select a file or profile

1. Point SecretSpec at another file with `SECRETSPEC_FILE`. Without it,
   SecretSpec walks up from the working directory to find `secretspec.toml`.
2. Pick a profile declared in that file with `SECRETSPEC_PROFILE`:

   ```sh
   SECRETSPEC_FILE=config.toml SECRETSPEC_PROFILE=release \
     SECRETSPEC_PROVIDER=dotenv:values.env bun run variables -e development
   ```

3. Check the result. A profile name never selects a Forge environment, so pass
   `-e` (or declare `FORGE_ENVIRONMENT` in that profile) to change the target.

## Verify profile selection

Run a value-free report in the same shell and profile before any remote change:

```sh
secretspec check --scope '' --explain
bun run fence-rider doctor --resolve
```

Inspect the selected provider routes and required-name status without exporting
values. Doctor checks validity and warns about ambient names; it does not
print or confirm the target values. Review the non-secret controls in your
selected configuration before execution.

For [installation management](use-forge-tooling.md), use the configured
scripts with valid profile defaults. Appended Forge options can override those
defaults, but do not bypass their validation. Consult the
[command help](../reference/command-help.md) for wrapper and forwarded options.
