# Tutorial: build a Forge workflow with package scripts

In this tutorial you configure a registered Forge app with Fence Rider scripts
for lint, variable upload, deployment, installation, and tunneling. You use
synthetic dotenv values throughout; do not replace them with real credentials.
Live Forge behavior remains unverified in this repository. The remote steps
below describe the expected results, not a recorded live validation pass.

Steps marked **Changes remote state** contact Forge. Run them only against a
disposable development app, site and environment that you are authorized to
change. If you do not have one, stop after step 5: everything up to there is
local.

You need Bun 1.4.3+, SecretSpec and the Forge CLI on `PATH`, Forge
authenticated, and a Forge app directory containing `manifest.yml`. Install
Fence Rider into the app first, following the
[installation guide](../how-to/installation.md#pack-and-install).

## 1. Keep local values out of Git

Add `values.env` to the app's `.gitignore` before you create it:

```sh
echo "values.env" >> .gitignore
```

## 2. Check your tools

```sh
bun run fence-rider doctor
```

You should see `SecretSpec:` and `Forge CLI:` lines ending in `ok`. The other
lines fail for now because the app has no `secretspec.toml`. Fix a tool line
before you continue.

## 3. Declare your variables

Create `secretspec.toml` in the app directory:

```toml
[project]
name = "my-forge-app"
revision = "1.0"

[profiles.default]
FORGE_ENVIRONMENT = { description = "Target", default = "development" }
FORGE_SITE = { description = "Site", default = "your-site.atlassian.net" }
FORGE_PRODUCT = { description = "Product", default = "jira" }
SERVICE_URL = { description = "Service endpoint", required = true }
API_TOKEN = { description = "Runtime credential", required = true }

[scopes.manifest]
secrets = ["SERVICE_URL"]

[scopes.runtime]
secrets = ["API_TOKEN"]
```

Replace `your-site.atlassian.net` with your development site. Create
`values.env` with synthetic values:

```dotenv
SERVICE_URL=https://example.org
API_TOKEN=synthetic-development-only
```

Select the provider for your shell session:

```sh
export SECRETSPEC_PROVIDER=dotenv:values.env
```

## 4. Declare the manifest input

Merge this into `manifest.yml`:

```yaml
environment:
  variables:
    - SERVICE_URL
```

Run `doctor` again:

```sh
bun run fence-rider doctor
```

Now every line should succeed, including:

```text
Schema: 5 declarations ok
Manifest: manifest scope members are declared in manifest.yml
Runtime: 1 member would be uploaded by variables
```

This is your first success: Fence Rider reads your configuration and manifest
and finds them consistent.

## 5. Add and run `lint:forge`

Add this script to `package.json`:

```json
{
  "scripts": {
    "lint:forge": "cmd=$(fence-rider lint) && sh -c \"$cmd\" sh"
  }
}
```

Run it:

```sh
bun run lint:forge
```

Forge validates your manifest with the resolved values and reports no errors.
Lint uploads nothing.

## 6. Upload variables and deploy

**Changes remote state.** Add the runtime scripts:

```json
{
  "scripts": {
    "variables": "fence-rider variables",
    "deploy": "cmd=$(fence-rider deploy -- --non-interactive --approve MAJOR_VERSION_RULE) && sh -c \"$cmd\" sh",
    "release": "fence-rider variables && cmd=$(fence-rider deploy -- --non-interactive --approve MAJOR_VERSION_RULE) && sh -c \"$cmd\" sh"
  }
}
```

Upload `API_TOKEN`, then deploy:

```sh
bun run variables --environment development &&
  bun run deploy --environment development
```

`variables` prints `Uploaded 1 runtime variable(s).` and never shows the value.
`deploy` ends with Forge's deployment summary for the development environment.

## 7. Install the app

**Changes remote state.** Add the install scripts:

```json
{
  "scripts": {
    "install:forge": "cmd=$(fence-rider install -- --confirm-scopes --non-interactive) && sh -c \"$cmd\" sh",
    "upgrade:forge": "cmd=$(fence-rider install -- --upgrade --confirm-scopes --non-interactive) && sh -c \"$cmd\" sh",
    "uninstall:forge": "cmd=$(fence-rider uninstall) && sh -c \"$cmd\" sh"
  }
}
```

Install into the site and environment from your profile:

```sh
bun run install:forge
```

Forge reports that the app is installed on your site. You do not run
`upgrade:forge` or `uninstall:forge` in this tutorial.

## 8. Start a tunnel

**Changes remote state.** Add the last script:

```json
{
  "scripts": {
    "tunnel": "cmd=$(fence-rider tunnel) && sh -c \"$cmd\" sh"
  }
}
```

Start it, then invoke your app from the development site:

```sh
bun run tunnel --environment development
```

Forge reports that the tunnel is running and prints your function's output as
you invoke it. Stop with Ctrl-C. The output is live and unredacted.

## What you built

You now have scripts for the configured workflow. The
[tested package example](../examples/package.json) includes these scripts and a
separate reviewed-approval variant. Reuse the default-target `release` script
when you want upload and deployment together; this lesson ran the two commands
explicitly, with matching environments.

## Next steps

- Change targets or profiles: [set local values](../how-to/local.md).
- Add more manifest inputs: [declare manifest inputs](../how-to/manifest.md).
- Use CI or recover from a failed upload: [runtime variables](../how-to/runtime.md).
- Understand the three kinds of variables: [explanation](../explanation/three-kinds-of-env-vars.md).
- Look up every option: [command help](../reference/command-help.md) and the
  [variable contract](../reference/reference.md).
