# Upload runtime variables, deploy and tunnel

Use this guide to send selected values to a Forge app's runtime with your own
SecretSpec provider, then deploy it. Only members of the `runtime` scope are
uploaded, encrypted.

Before you start, finish the [installation guide](installation.md), and use a
registered app and environment you are authorized to change. Live Forge
compatibility is not yet certified; see the [version
evidence](../reference/deployment.md).

## Configure a dotenv provider

1. Declare the runtime members in `secretspec.toml`, with declarations only and
   no secrets:

   ```toml
   [profiles.default]
   API_TOKEN = { description = "Runtime credential", required = true }
   OPTIONAL = { description = "Optional runtime setting", required = false }

   [scopes.runtime]
   secrets = ["API_TOKEN", "OPTIONAL"]
   ```

2. Add `values.env` to the app's `.gitignore`, then create it. For a
   disposable development exercise only:

   ```dotenv
   API_TOKEN=synthetic-development-only
   ```

   Omit `OPTIONAL` to leave it absent; do not write empty placeholders.
3. Select the provider in your shell:

   ```sh
   export SECRETSPEC_PROVIDER=dotenv:values.env
   ```

Keeper and other vault syntax are not certified here; use SecretSpec's own
documentation for them.

## Upload variables and deploy

1. Add the `variables` and `deploy` scripts from the [full script
   set](installation.md#add-the-full-script-set).
2. Upload when a runtime value changes. Deploy never uploads:

   ```sh
   bun run variables --environment development
   ```

3. Deploy to the same environment:

   ```sh
   bun run deploy --environment development
   ```

4. To do both in one step, use the `release` script, which stops before
   deploying if the upload fails.

Variables are stored for the named environment and become active only after a
later deploy to it. Absent optionals are not uploaded, and earlier remote
values are not deleted.

## Tunnel during development

Use a registered, deployed and installed disposable development app that you
are authorized to redirect. Forge allows tunnels only for development
environments.

1. Declare every required value, and put only the names your functions read
   in `[scopes.runtime]`. Do not declare names starting with `FORGE_USER_VAR_`.
2. Add the `tunnel` script from the [full script
   set](installation.md#add-the-full-script-set).
3. Start it, then invoke the app through the authorized development site:

   ```sh
   bun run tunnel --environment development
   ```

4. Stop with Ctrl-C. Output is live and unredacted, so keep values out of
   your logs.

Tunnel maps runtime members to Forge's local mechanism and uploads nothing; see
[its contract][tunnel]. Connected runtime receipt is unverified.

## Deploy in CI with existing authentication

1. Provision SecretSpec, the Forge CLI and `fence-rider` in the runner, using
   the tested versions from the [version evidence](../reference/deployment.md).
2. Supply `FORGE_EMAIL` and `FORGE_API_TOKEN` from the runner's protected
   secret settings, using a Forge-supported scoped API token. Never run an
   interactive login or print them.
3. Authenticate your provider with SecretSpec's own configuration. For dotenv,
   provision an ignored `values.env` and remove it after the job.
4. Disable shell tracing and run the `release` script. Only deploy accepts
   `--non-interactive`; `variables` takes no Forge options.
5. Treat a nonzero exit as failure. Fix the cause before retrying.

## Recover from a partial upload

`variables` uploads one value at a time and never rolls back. If it fails after
the first upload, remote variables may have changed.

1. Read the error. Fix the missing value, configuration or authentication.
2. Review the target environment's variables with Forge before rerunning.
3. Rerun `variables`, which uploads every runtime member again.
4. Deploy again so the stored values become active.

Empty values and values starting with a dash are refused before any upload. See
the [failure boundary](../reference/reference.md#forge-boundaries-and-failures)
for the full list.

## Arrange a live smoke test

Live verification is blocked until someone authorizes it. Do not infer
permission from a login or app access.

1. Before contacting Forge, agree and write down the disposable app ID,
   development environment, synthetic variable names, permitted deployment,
   runtime observation and cleanup operations.
2. After authorization, record the exact Forge and SecretSpec versions.
3. Upload and deploy, then record the redacted encrypted-variable metadata for
   the named target and that upload and deploy used the same target.
4. Observe runtime activation with an approved check that emits only a boolean
   comparison, never the value.
5. Clean up within the agreed scope. Never use an existing production app or
   print decrypted values.

Until this passes, keep live verification blocked, as recorded in the [live
verification spec](../../specs/live-forge-verification.md).

[tunnel]: ../reference/reference.md#configured-tunnel
