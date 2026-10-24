# Set local values for tooling and targets

Use this guide to choose the Forge environment, site and product that Fence
Rider's workflows target, and to select which SecretSpec file and profile
supplies them. These controls are never uploaded to Forge's runtime store.

Before you start, finish the [installation guide](installation.md) and
[provider setup](configure-user-providers.md), and use an app and site you are
authorized to change. Run commands from the consuming app root.

## Declare the targets

1. In the active profile of `secretspec.toml`, declare the controls you need.
   This example intentionally shares non-secret defaults across projects.
   Only `FORGE_ENVIRONMENT` falls back to `development` when it is absent:

   ```toml
   [profiles.default]
   FORGE_ENVIRONMENT = { description = "Deployment target", default = "development", providers = ["shared_config"] }
   FORGE_SITE = { description = "Installation site", default = "example.atlassian.net", providers = ["shared_config"] }
   FORGE_PRODUCT = { description = "Installation product", default = "jira", providers = ["shared_config"] }
   ```

2. For a target that must not follow shared defaults, change its route to
   `providers = ["project_config"]` and configure that binding first. Review
   production targets explicitly. A value being local to tooling does not mean
   its storage is project-specific.
3. Keep these names out of `[scopes.runtime]`; selecting a control for upload
   fails before any write.
4. Supply values through the same aliases the declarations read. For shared
   controls:

   ```sh
   secretspec set --provider shared_config --profile default FORGE_SITE
   secretspec set --provider shared_config --profile default FORGE_PRODUCT
   secretspec set --provider shared_config --profile default FORGE_ENVIRONMENT
   ```

   Use `--provider project_config` instead for a declaration routed there.
   Enter only non-secret controls, never tokens, into these config roles.

## Select a file or profile

1. Point SecretSpec at another file with `SECRETSPEC_FILE`. Without it,
   SecretSpec walks up from the working directory to find `secretspec.toml`.
2. Pick a profile declared in that file with `SECRETSPEC_PROFILE`:

   ```sh
   export SECRETSPEC_FILE=config.toml
   export SECRETSPEC_PROFILE=release
   ```

3. Configure the semantic aliases used by that profile on this workstation or
   CI runner. Do not apply a blanket `SECRETSPEC_PROVIDER=dotenv:values.env`
   override to a profile containing both config and credentials.
4. Check the result below before running a workflow. A profile name never
   selects a Forge environment, so pass `-e` (or declare `FORGE_ENVIRONMENT` in
   that profile) to change the target. Changing profiles can also change a
   backend's credential addresses; verify existing values before writing.

## Verify profile selection

Run a value-free report in the same shell and profile before any remote change:

```sh
secretspec check --scope '' --explain
bun run fence-rider doctor --resolve
```

Inspect the selected provider routes and required-name status without exporting
values. Doctor checks validity and warns about ambient names; it does not
print or confirm the target values. Review the non-secret controls in your
selected configuration before execution. Provider access can authenticate or
create audit records; review diagnostic locations before sharing output.

For [installation management](use-forge-tooling.md), use the configured
scripts with valid profile defaults. Appended Forge options can override those
defaults, but do not bypass their validation. Consult the
[command help](../reference/command-help.md) for wrapper and forwarded options.
