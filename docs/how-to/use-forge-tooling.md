# Run Forge workflows with configured package scripts

Complete [user setup](configure-user-providers.md)
and [app setup](configure-app-secrets.md) first.
Run these commands from the repository root
with the app, site, product, and environment reviewed.
Existing scripts encode consent flags;
their presence is not permission to run them.

## Validate before remote changes

```sh
secretspec check --scope '' --explain
npm run fence-rider doctor --resolve
npm run lint:forge
npm run check
```

The configured lint script validates all required profile values
before Forge starts, including runtime credentials.
The same early validation applies to the other configured workflows.

## Upload runtime values, then deploy

When a runtime value is first provisioned or changes,
upload it and deploy to the **same** environment:

```sh
npm run forge:variables:set --environment development &&
  npm run forge:deploy --environment development
```

`forge:variables:set` runs `fence-rider variables`
and uploads only `runtime` members, encrypted.
It makes a remote change immediately.
Uploads are sequential and are not rolled back on partial failure.
Investigate a failed upload before rerunning;
deployment must not proceed after failure.

`forge:deploy` runs the generated script under SecretSpec and deploys code.
It **never uploads runtime variables**.
Forge activates a newly stored variable on a subsequent deployment.
For code-only changes with unchanged runtime values, run just:

```sh
bun run forge:deploy --environment development
```

## Install, upgrade, and remove

After a deployment, install the app on the selected site/product:

```sh
bun run forge:install
```

For an existing installation after a scope or egress change, deploy and then:

```sh
bun run forge:upgrade
```

Both installation scripts already pass `--confirm-scopes --non-interactive`;
the upgrade script also passes `--upgrade`.
Review those permissions before execution.
Do not copy these flags onto unrelated Forge commands.

To remove an authorized installation:

```sh
bun run forge:uninstall
```

Uninstall intentionally does not include `--non-interactive`;
respond to Forge's confirmation.
Registration is a separate one-time adoption operation:
`bun run forge:register` calls Forge directly and creates an app identity.
Do not register an already registered checkout as routine setup.

## Select a profile or target deliberately

Use `SECRETSPEC_PROFILE` for a profile already declared by the app.
Use `SECRETSPEC_FILE` for another declaration file
when intentionally sharing a schema.
Neither a filename nor a profile called `production`
automatically sets Forge's environment.

`forge:variables:set --environment TARGET` is a Fence Rider option;
it does not accept forwarded Forge flags.
Appended arguments on the existing
`forge:deploy`, install, upgrade, uninstall, and lint package scripts
reach the executed Forge command.
The scripts have already consumed Fence Rider's own `--` separator.

For example, an explicitly authorized installation target override is:

```sh
bun run forge:install --environment development \
  --site example.atlassian.net --product jira
```

Keep upload and deployment targets identical.
Do not assume flags valid for install are valid for uninstall, lint, or deploy.
This documentation provides has no tunnel script;
use Fence Rider's upstream tunnel guide when adding one,
then review permission to redirect development invocations before starting it.

## Use raw SecretSpec for provider operations and narrow checks

Use SecretSpec directly to create aliases,
authenticate a backend,
set values,
select profiles,
and inspect value-free resolution reports.
Fence Rider does not replace these operations.

For local commands that need resolved settings
but are not Forge workflows,
use a deliberately narrow child command.
This check emits no values:

```sh
secretspec run --scope '' -- sh -c 'test -n "$FORGE_SITE"'
```

It still resolves the whole profile and may access its providers.
Use only trusted child processes.
Do not run a coding-agent session, `env`, `printenv`, or a verbose debug tool
under a fully injected secret environment.

Use raw Forge for separately approved administrative commands
that the wrapper does not cover,
such as authentication or logs.
If you intentionally need to bypasses the app's target and workflow conventions,
you may replace the existing configured deployment/installation scripts
with an ad hoc `secretspec run -- forge ...`.
But, beware that local injection alone does not upload runtime variables
or provide Fence Rider's runtime selection checks.

For exact script effects,
see the [reference](../reference/forge-tooling.md).
