# Use configured Forge package scripts

Use an existing registered Forge app and the [installed package](installation.md).
Keep Forge installation, authentication and provider access separate. Obtain
permission for the particular app/site/environment before any command contacting
Forge. The examples below are procedures, not live-service certification.

## Declare inputs once

Adapt [the synthetic declarations](../examples/secretspec.toml) to your app.
They include canonical environment/site/product defaults, an implicit local input,
a manifest input, an explicit runtime input and a shared manifest/runtime input.
Names outside scopes remain local; only runtime members upload on deployment.
Merge the [manifest fragment](../examples/manifest.yml) into the existing app's
manifest, retaining its registered app ID and modules. The empty `app` is a
controlled fixture, not a deployable app. Use `${MANIFEST_INPUT}` and
`${SHARED}` only in fields where Forge supports substitution.

Choose your own native SecretSpec provider. For a synthetic local exercise,
use the [public dotenv fixture](../examples/values.env) as a template and select
`SECRETSPEC_PROVIDER=dotenv:values.env` outside package scripts. Ignore real
provider files before writing credentials. Do not put values in scripts.

## Keep workflow policy visible

Merge the scripts from [the tested package example](../examples/package.json)
into the app's existing `package.json`; retain its installed development dependency.
The example has no helper, target expansion, or separate key inventory:

```json
{
  "deploy": "fence-rider deploy --non-interactive --approve MAJOR_VERSION_RULE",
  "deploy:reviewed": "fence-rider deploy --non-interactive --approve REVIEWED_RULE_FROM_FORGE",
  "install:forge": "cmd=$(fence-rider install --confirm-scopes --non-interactive) && sh -c \"$cmd\" sh",
  "upgrade:forge": "cmd=$(fence-rider install --upgrade --confirm-scopes --non-interactive) && sh -c \"$cmd\" sh",
  "uninstall:forge": "cmd=$(fence-rider uninstall) && sh -c \"$cmd\" sh",
  "lint:forge": "cmd=$(fence-rider lint) && sh -c \"$cmd\" sh",
  "tunnel": "fence-rider tunnel"
}
```

Deploy and tunnel run Fence Rider directly. Lint, install and uninstall print a
shell script, and the package script runs it:

- The `&&` keeps the script from running when Fence Rider refuses. A refusal
  prints its reason on stderr and nothing on stdout. Without the guard,
  `eval "$(fence-rider lint)"` evaluates an empty string and exits 0, so the
  refusal would silently pass.
- `sh -c "$cmd" sh` runs the script in a fresh shell rather than using `eval`.
  Arguments a script runner appends arrive as the script's `"$@"` and are not
  parsed a second time, so spaces and quotes stay intact.
- The script ends in `exec`, so `secretspec run` replaces the shell. Ctrl-C,
  the exit status and interactive prompts go straight to SecretSpec and Forge.
- Options written inside the generator call, such as `--confirm-scopes`, are
  quoted into the script; options appended by the runner come after them.

`MAJOR_VERSION_RULE` is the documented Forge approval rule. Replace the explicit
`REVIEWED_RULE_FROM_FORGE` placeholder with a different exact rule reported by
Forge before using that variant; no second server rule is certified here. The
automated controlled test establishes distinct-token forwarding, not server
acceptance. Rules are forwarded policy, not automatic approval of all changes.
Deployment approval does not grant install scope consent. Keep `--confirm-scopes`,
`--non-interactive` and `--upgrade` only where that policy is intended.

## Run the intended lifecycle

- Run `bun run lint:forge` for whole-profile resolution under `secretspec run`
  and live Forge lint output. No targets or runtime uploads are injected, and the
  optional manifest check is `bun run fence-rider doctor`.
- Run `bun run deploy` or the distinct approval variant `bun run deploy:reviewed`
  only after reviewing that policy. Deployment encrypts selected runtime values
  before one deployment to the same environment. Partial writes can remain after
  failure; nothing is rolled back or remotely deleted. Deployment activates
  changed stored values under Forge's documented lifecycle.
- Run `bun run install:forge` or `bun run upgrade:forge` for the configured
  installation. These do not deploy, upload, or activate runtime changes.
- Run `bun run uninstall:forge` only with removal authorization. There is no
  injected confirmation/non-interactive/upgrade/consent policy and no guarantee
  of an additional prompt. Forge 14.2.0 has no uninstall `--non-interactive` flag.
- Run `bun run tunnel` only for an already deployed/installed development app
  and authorized local redirection. Runtime members map to `FORGE_USER_VAR_<name>`
  without remote synchronization. Staging/production are rejected; named targets
  must already be development environments. Stop with Ctrl-C.

Targets for install/uninstall come only from the profile; to aim elsewhere,
select another profile, change the declaration, or export the variable when
the profile leaves it unresolved. Extra Forge options are appended to the
script's arguments:

```sh
bun run lint:forge --verbose
```

Environment falls back to development for install/uninstall; site/product never
do, and `--site`, `--product` and `--environment` are refused there. Supported
product values are `jira`, `confluence`, `compass`, and `bitbucket`. Lint
receives no injected target; deploy/tunnel receive environment only. Native
profile/file selection remains `SECRETSPEC_PROFILE`/`SECRETSPEC_FILE`, not a
Forge environment switch. An explicit deploy or tunnel target never waives
required values. See the [exact command grammar][contract].

## Use a controls-only app

If the app needs only workflow defaults, declare only those controls:

```toml
[project]
name = "controls-only"
revision = "1.0"

[profiles.default]
FORGE_ENVIRONMENT = { description = "Target", default = "development" }
FORGE_SITE = { description = "Site", default = "example.atlassian.net" }
FORGE_PRODUCT = { description = "Product", default = "jira" }
```

No scope or dummy credential is needed. Deployment performs no variable writes.
For legitimate absence use native optional declarations or a suitable profile;
all commands still require every required declaration in the active profile.

## Handle output and limits

Lint/install/uninstall/tunnel inherit input and stream output without redaction;
never publish output on the assumption that values are hidden. Deployment and
private resolution/upload helpers suppress raw output. OS process inspection can
still expose positional upload values and child environments. For deploy and
tunnel, SIGINT/SIGTERM stop later work and bound descendant cleanup on exercised
POSIX systems; SIGKILL and untested platforms provide no cleanup guarantee.
Lint, install and uninstall have no Fence Rider process to interrupt, so the
terminal signals `secretspec run` and Forge directly.

Use Forge directly for unsupported commands, app registration, login, variable
listing/deletion, logs, and other administrative operations. Do not infer those
commands are safely configured by this wrapper. Single-file/profile limits,
native provider evidence and live blockers are in the
[consumer acceptance reference](../reference/consumer-workflows.md).

[contract]: ../reference/reference.md
