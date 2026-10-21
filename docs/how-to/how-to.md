# Deploy with your own SecretSpec provider

Use this guide to deploy an existing Forge app without access to a
maintainer's vault. Follow the [package installation guide](installation.md)
first, or use the [standalone development build](../../README.md) with SecretSpec
0.21.1 on PATH. Forge CLI and existing authentication remain separate. Use an
app and environment you are authorized to change.
Live Forge compatibility is not yet certified; see the
[version and evidence record](../reference/deployment.md).

## Configure a local provider

1. Work from your Forge app directory. Keep its existing registered app ID
   and valid `manifest.yml`; Fence Rider does not register apps.
2. Create a repository-owned `secretspec.toml` with declarations, not secrets:

   ```toml
   [project]
   name = "my-forge-app"
   revision = "1.0"

   [profiles.default]
   FORGE_ENV = { description = "Deployment target", default = "development" }
   SERVICE_URL = { description = "Service endpoint", required = true }
   API_TOKEN = { description = "Runtime credential", required = true }
   OPTIONAL = { description = "Optional runtime setting", required = false }

   [scopes.runtime]
   secrets = ["API_TOKEN", "OPTIONAL"]

   [scopes.manifest]
   secrets = ["SERVICE_URL"]
   ```

3. Add the manifest input to your app's native declaration, merging into
   its existing `environment` section rather than replacing the manifest:

   ```yaml
   environment:
     variables:
       - SERVICE_URL
   ```

   Use `${SERVICE_URL}` only in a Forge-supported substitution field that
   your app needs. The SecretSpec `manifest` scope is optional: omitting it
   skips the consistency check, not local resolution or Forge substitution.
   If the scope is present but a member lacks a Forge declaration, Fence Rider
   fails before any upload. Forge still validates the whole manifest.

4. Ignore `values.env` in the app's `.gitignore` before creating it. Supply
   your own values there. For a disposable development exercise only:

   ```dotenv
   SERVICE_URL=https://example.com
   API_TOKEN=synthetic-development-only
   ```

   Omit `OPTIONAL` to leave it absent; do not put empty placeholders in runtime
   members. Never commit provider files containing real credentials. This
   dotenv setup is the exercised provider; Keeper and other vault syntax,
   authentication, and fallback behavior are not certified here.

5. Invoke the binary from the app directory, replacing the executable path:

   ```sh
   SECRETSPEC_PROVIDER=dotenv:values.env /absolute/path/to/dist/cli deploy --environment development --non-interactive
   ```

   This writes encrypted `API_TOKEN` to the named app/environment, then
   deploys there. `OPTIONAL` is not uploaded when absent; previous remote
   values are not deleted. `SERVICE_URL` remains local for the manifest.
   Progress prints names, targets, and stages, never values or helper output.

## Run configured lint

From the configured app directory, use the same provider and built binary:

```sh
SECRETSPEC_PROVIDER=dotenv:values.env /absolute/path/to/dist/cli lint
```

To use a short package script, put the built binary on `PATH` as `fence-rider`
and add this entry to the app's existing `scripts` object:

```json
{ "lint:forge": "fence-rider lint" }
```

Run `bun run lint:forge`, or append explicit Forge options such as `--verbose`.
No target-variable expansion, Bash helper, or second variable inventory is
needed. The [installed package](installation.md) supplies the executable; SecretSpec
and Forge remain separately installed on `PATH`.

Resolve every required profile declaration, including runtime credentials,
before lint. Use native optional declarations or a suitable profile for
legitimate absence; a manifest scope does not narrow requiredness. If manifest
membership is present, declare each effective member in `environment.variables`.

Lint performs no runtime uploads or deployment and adds no target flags.
Forge's `--fix` can change local files only when you request it. Forge output
streams live **without redaction**; do not assume command output or echoed input
is safe to publish. Private configuration-helper output stays suppressed; see
the [output and input policy](../reference/reference.md#output-and-input-policy).

## Install or upgrade the configured app

1. Add site and product defaults to the active SecretSpec profile:

   ```toml
   FORGE_SITE = { description = "Installation site", default = "example.atlassian.net" }
   FORGE_PRODUCT = { description = "Installation product", default = "jira" }
   ```

2. Put the built binary on `PATH` as `fence-rider`. Add these entries to your
   app's existing package scripts:

   ```json
   {
     "install:forge": "fence-rider install",
     "upgrade:forge": "fence-rider install --upgrade"
   }
   ```

3. With your provider configured, run `bun run install:forge` for initial
   installation, or `bun run upgrade:forge` to upgrade an existing installation.
   Both change remote installation state; use only an authorized app and site.
   Forge owns remaining prompts. Add `--confirm-scopes` and `--non-interactive`
   explicitly only when that consent and interaction policy is intended:

   ```sh
   SECRETSPEC_PROVIDER=dotenv:values.env /absolute/path/to/dist/cli install --upgrade --confirm-scopes --non-interactive
   ```

Override individual targets with `--site URL`, `--product PRODUCT`, and
`--environment TARGET`. Each wins over its resolved control independently.
Only environment falls back to `development`; absent site/product fails rather
than opening a target picker. Canonical `FORGE_ENVIRONMENT` and legacy
`FORGE_ENV` must agree when both resolve. SecretSpec profile names never select
Forge environments. Explicit targets do not waive required declarations.

Installation and upgrade do not upload, delete, or activate changed runtime
values, deploy code, or apply Fence Rider's optional manifest declaration check.
They resolve the whole profile and run only one `forge install`. Output and input
are live and not redacted. See the [installation reference][installation] for
verified grammar, products, and the separate live-verification blocker.

[installation]: ../reference/reference.md#configured-installation

## Uninstall the configured app

1. Configure site/product defaults as in [installation above][installation],
   resolve every required profile value, and use the installed `fence-rider`
   executable (or put the standalone development binary on PATH).
2. Add this entry to your app's existing package scripts:

   ```json
   { "uninstall:forge": "fence-rider uninstall" }
   ```

3. Review the destination and obtain authorization to remove that installation.
   **This command changes remote installation state**, not just local files.
   Run it only against your authorized app/site/environment:

   ```sh
   SECRETSPEC_PROVIDER=dotenv:values.env bun run uninstall:forge
   ```

Override individual targets explicitly with `--site URL`, `--product PRODUCT`,
and `--environment TARGET`. Defaults and alias checks match installation.
Missing required app credentials still block uninstall despite explicit targets;
use native optional declarations or a suitable profile for legitimate absence.

Forge owns remaining interaction and may uninstall directly once targets match;
do not rely on an extra confirmation prompt. Fence Rider injects no upgrade,
consent, approval, confirmation, or non-interactive switches. Forge 14.2.0
uninstall does **not** support `--non-interactive`; do not copy install's CI flags.
Input/output is inherited live without redaction. Runtime scope membership adds
no uploads, variable deletion, deployment, installation, or follow-up commands.
The optional manifest declaration cross-check does not run for uninstall.

Local controlled checks do not certify real removal or terminal-specific prompts.
Live uninstall requires separate authorization naming the disposable app, site,
environment, permitted removal, observations, and cleanup. No such live check
has run. See the [uninstall reference][uninstall].

[uninstall]: ../reference/reference.md#configured-uninstall

## Tunnel with configured local runtime values

Use an already registered, deployed, and installed disposable Forge development
app, with authorization to redirect its invocations. Install and authenticate
Forge separately on PATH, along with SecretSpec per the
[installation guide](installation.md). The wrapper does not deploy or install
the app's prerequisites. Named targets must already be development environments.

1. Declare all required values in `secretspec.toml`. Add only intended function
   runtime names to `[scopes.runtime].secrets`; keep targeting controls out.
   Do not declare names beginning with `FORGE_USER_VAR_`. Controls-only apps
   need no runtime scope. Match optional manifest-scope declarations.
2. Supply values through your authenticated provider. For synthetic dotenv
   use, keep the values file ignored and set `SECRETSPEC_PROVIDER=dotenv:values.env`.
   Explicit targets do not bypass required values or conflicting aliases.
3. Add a short script alongside the other app scripts:

   ```json
   {
     "scripts": {
       "tunnel": "fence-rider tunnel"
     }
   }
   ```

   Use the installed `fence-rider` executable. Run
   `bun run tunnel --environment development`, or select an
   authorized existing named development environment. Use `fence-rider tunnel
   --help` for discovery; `-h` is Forge's debug-host option, not help.
4. After connection, invoke the installed app through the authorized development
   site. Avoid logging values: Forge/tunnel/app output is live
   **without redaction**.
   Stop the tunnel with Ctrl-C.

The wrapper maps explicit runtime members to Forge's local mechanism; it does
not upload/delete remote variables, deploy, or install. Empty runtime strings
are allowed; absent optionals and stale ambient prefixed values are omitted.
See the [exact mapping and restrictions][tunnel-contract]. This is a procedure,
not live success evidence: connected runtime receipt remains blocked pending
separate authorization in the [validation record](../reference/validation.md).

[tunnel-contract]: ../reference/reference.md#configured-tunnel

## Select a profile, file, or deployment target

Use `SECRETSPEC_FILE` for a different single TOML file and
`SECRETSPEC_PROFILE` for a profile declared within it:

```sh
SECRETSPEC_FILE=config.toml SECRETSPEC_PROFILE=release SECRETSPEC_PROVIDER=dotenv:values.env /absolute/path/to/dist/cli deploy -e development --non-interactive
```

Define `release` in that file first. Native profile inheritance remains
supported; non-empty or malformed `project.extends` fails before resolution.
Cross-file specification inheritance is deferred. Provider paths in this
guide assume the app's working directory.

An explicit `-e TARGET` or `--environment TARGET` wins over the resolved
canonical `FORGE_ENVIRONMENT` (or legacy `FORGE_ENV`), then `development`.
Conflicting resolved aliases fail even with an explicit override.
Attached `-eTARGET` and
`--environment=TARGET` are accepted; repeated or missing targets are errors.
A profile named `release` does not select a Forge environment by its name.
Other Forge options are forwarded to deployment only. `FORGE_SITE` and
`FORGE_PRODUCT` remain local; they generate no deployment flags or uploads.

The full active profile is resolved once, with no scope filter, even when
`SECRETSPEC_SCOPE` is set. Unscoped required inputs must resolve too. All
resolved application values reach local Forge processes, and shared runtime
values reuse that same result. Do not declare Forge login credentials in
`runtime`. Existing ambient authentication is retained; provider-private
state is not collected automatically.

## Deploy in CI using existing authentication

1. Provision the CLIs and built binary in the runner before deployment. Use
   the tested versions in the evidence record; do not assume a tested range.
2. Supply existing `FORGE_EMAIL` and `FORGE_API_TOKEN` credentials through the
   runner's protected secret settings. Use a Forge-supported scoped API token.
   Do not run an interactive login in CI or print these variables.
3. Supply your provider's existing authentication using SecretSpec's own
   configuration. For the exercised dotenv setup, securely provision an
   ignored `values.env` in the app directory; remove it after the job.
4. Run the explicit target command above with `--non-interactive`. Disable
   shell tracing. Fence Rider uses non-interactive SecretSpec export and
   supplies both positional arguments to `forge variables set`; that command
   has no documented `--non-interactive` flag. Only deployment receives it.
5. Treat a nonzero exit as failure. Resolve missing values or configuration
   before retrying. Provider fallback and login remain SecretSpec concerns;
   Fence Rider does not download dependencies, prompt for values, or log in.

## Handle failures and unsupported workflows

After any attempted upload, a failure can leave partial remote changes.
There is no automatic rollback, retry, or deletion. Correct the cause and
review the target before rerunning. Stored variables require deployment to
the same environment to become active under Forge's documented lifecycle;
that activation is not yet verified by an authorized live smoke test here.

Values are passed without a shell, but Forge's verified interface uses
positional values. Operating-system process inspection may expose arguments;
redacted diagnostics do not remove that risk. Empty and leading-dash runtime
values are rejected before any upload. Local empty strings and string values
`"0"` and `"false"` are preserved; absent optionals are not coerced or deleted.

Use [configured tunneling](#tunnel-with-configured-local-runtime-values) only
for authorized development environments. Its local runtime mapping is not a
reuse of remote uploads. Staging/production tunneling is rejected. Configured
installation above is not runtime variable activation.

## Arrange a live smoke test

Before contacting Forge, agree the disposable app ID, development environment,
synthetic variable names, permitted deployment, runtime observation, and
cleanup operations. Do not infer permission from a login or app access.

After authorization, record exact versions and redacted results: encrypted
variable metadata in the named target, upload/deploy target consistency, and
runtime activation after deployment using an approved observation that emits
only a boolean comparison, never the value. Do not print decrypted values or
use an existing production app. Cleanup must stay within the agreed scope.
Until that test is authorized and passes, keep live verification blocked.
