# Upload runtime variables, deploy and tunnel

Use this guide with a registered app and environment you are authorized to
change. First [install the package scripts](installation.md#add-the-full-script-set)
and [configure app secrets](configure-app-secrets.md). For a synthetic dotenv
exercise instead of real credentials, follow the [tutorial](../tutorials/tutorial.md).

Declare only the names your functions need in `[scopes.runtime]`. Storage roles
and delivery are independent: credentials can use `project_secrets` and
non-secret runtime config can use `project_config`. Neither is uploaded merely
because of its alias. Do not declare names starting with `FORGE_USER_VAR_`.
Only runtime members upload, always
encrypted. Live Forge behavior remains unverified; the
[validation record](../../specs/validation.md) separates local evidence from
live observations.

## Upload variables and deploy

When a runtime value is first provisioned or changes, upload it and deploy to
the **same** environment. Chain the commands so a failed upload stops deployment:

```sh
bun run variables --environment development &&
  bun run deploy --environment development
```

For code-only changes with unchanged runtime values:

```sh
bun run deploy --environment development
```

To upload and deploy using the profile's configured `FORGE_ENVIRONMENT`, run:

```sh
bun run release
```

Do not append an environment override to `release`: appended arguments reach
only its deploy command, not its upload. For an override, use the two explicitly
matched commands above. For a different profile, [select it first](local.md#select-a-file-or-profile).

Forge activates stored variables on a subsequent deployment to that environment.
Absent optional values are not uploaded, and earlier remote values are not
deleted. A successful upload is not proof of activation in a deployed function.

## Tunnel during development

Use a deployed and installed disposable development app you are authorized to
redirect. Declare every required value and select the names your functions read
in the runtime scope, then start the configured tunnel script:

```sh
bun run tunnel --environment development
```

Invoke the app from the development site and stop with Ctrl-C. Keep credentials
out of app logs: output is live and unredacted. The script maps runtime members
to Forge's local prefixed environment and uploads nothing. Forge supports only
development tunnels; connected runtime receipt remains unverified here.

## Deploy in CI with existing authentication

1. Provision Bun, SecretSpec, the Forge CLI, and Fence Rider in the runner; see
   the [installation reference](../reference/installation.md).
2. Supply `FORGE_EMAIL` and `FORGE_API_TOKEN` from protected runner settings,
   using a Forge-supported scoped API token. Never print them or run interactive
   login in the job.
3. Bind only the app's required semantic aliases in the runner's operator-owned
   SecretSpec configuration. Use approved secret backends and verify
   project/profile addressing; never substitute a blanket dotenv override for
   mixed config and secrets. Protect provider bootstrap credentials too.
   Authenticate the provider, then set the intended profile and
   `FORGE_ENVIRONMENT` before running a combined release.
4. Disable shell tracing and run `bun run release`. The example deploy script
   includes `--non-interactive`; `variables` takes no Forge options.
5. Treat a nonzero exit as failure. Fix the cause before retrying.

## Recover from a partial upload

`variables` uploads one value at a time and never rolls back. A failure after
the first upload may leave remote variables changed.
1. Read the error and fix the missing value, configuration, or authentication.
2. Review the target environment's variable metadata with Forge before retrying;
   do not print credential values.
3. Rerun `variables` for that environment. It rewrites every selected runtime
   member, including unchanged ones.
4. Deploy to the same environment so the stored values become active.

Empty values and values starting with a dash are refused before any upload.
A valid selection with no runtime members uploads nothing and succeeds.
