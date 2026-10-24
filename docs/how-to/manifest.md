# Declare manifest inputs and check them

Use this guide to feed a SecretSpec value into a Forge manifest substitution
and have Fence Rider confirm the manifest declares it. A `manifest` scope alone
does not upload a value; adding it to `runtime` also selects it for upload.
Storage roles are independent of both scopes.

Before you start, finish the [installation guide](installation.md) and
[provider setup](configure-user-providers.md), including `project_config`, and
work from your Forge app directory. Fence Rider does not register apps or
rewrite your manifest.

## Declare a substitution input

1. Declare the value in the active profile of `secretspec.toml` and, to opt in
   to the check, list it in the optional `manifest` scope (see the
   [example](../examples/secretspec.toml)):

   ```toml
   [profiles.default]
   SERVICE_URL = { description = "Service endpoint", required = true, providers = ["project_config"] }

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
4. Store the non-secret URL through its declared route:

   ```sh
   secretspec set --provider project_config --profile default SERVICE_URL
   ```

   Enter only a URL safe for the configured plaintext backend, not one with an
   embedded credential. Route confidential inputs through a secret role instead;
   manifest use does not make them non-secret or safe for public disclosure.

## Check the declaration

1. Run `doctor` from the app directory:

   ```sh
   bun run fence-rider doctor
   ```

   It fails when a `manifest` scope member is missing from `manifest.yml`.
   Add `--resolve` to also confirm every required value resolves; that reads
   your provider and may prompt for authentication.
2. Add the `lint:forge` script from the
   [tested package example](../examples/package.json) and run it:

   ```sh
   bun run lint:forge
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
