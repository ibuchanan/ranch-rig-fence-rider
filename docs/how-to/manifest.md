# Declare manifest inputs and check them

Use this guide to feed a SecretSpec value into a Forge manifest substitution
and have Fence Rider confirm the manifest declares it. Manifest values stay
local: they are resolved for Forge's own processes and never uploaded.

Before you start, finish the [installation guide](installation.md) and work from
your Forge app directory. Fence Rider does not register apps or rewrite your
manifest.

## Declare a substitution input

1. Declare the value in the active profile of `secretspec.toml` and, to opt in
   to the check, list it in the optional `manifest` scope (see the
   [example](../examples/secretspec.toml)):

   ```toml
   [profiles.default]
   SERVICE_URL = { description = "Service endpoint", required = true }

   [scopes.manifest]
   secrets = ["SERVICE_URL"]
   ```

2. Merge the name into the `environment` section of your existing
   `manifest.yml` (see the [example](../examples/manifest.yml)):

   ```yaml
   environment:
     variables:
       - SERVICE_URL
   ```

3. Use `${SERVICE_URL}` in a Forge-supported substitution field that your app
   needs.
4. Supply a value through your provider. For a disposable exercise, put it in
   an ignored `values.env`, as in the [example](../examples/values.env).

## Check the declaration

1. Run `doctor` from the app directory:

   ```sh
   SECRETSPEC_PROVIDER=dotenv:values.env bun run fence-rider doctor
   ```

   It fails when a `manifest` scope member is missing from `manifest.yml`.
   Add `--resolve` to also confirm every required value resolves; that reads
   your provider and may prompt for authentication.
2. Add the `lint:forge` script from the
   [tested package example](../examples/package.json) and run it:

   ```sh
   SECRETSPEC_PROVIDER=dotenv:values.env bun run lint:forge
   ```

   Lint resolves the whole profile before Forge validates the manifest, and
   uploads nothing. Pass options such as `--verbose` after the script name.
3. Fix any failure and rerun both. `doctor` checks that the manifest declares
   the scope's members; Forge lint validates the substitutions themselves.

Omitting the `manifest` scope skips only the declaration check. The value is
still resolved locally and Forge still substitutes it. Forge output is live
and unredacted, so do not publish it.

See the [validation record](../../specs/validation.md) for evidence levels
and current limitations.
