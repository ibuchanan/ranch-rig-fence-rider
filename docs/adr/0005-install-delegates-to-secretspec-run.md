---
status: accepted
---

# Run install and uninstall under `secretspec run`

`fence-rider install` and `uninstall` used to resolve the profile themselves
(`secretspec schema` and `export`), validate and type the values, build the Forge
environment, and compute the three targets in TypeScript. With their option
parsing gone ([ADR 0004](0004-install-targets-from-profile-only.md)), all that
remained was three expansions and a pass-through, which `secretspec run`
already does. They now run `secretspec run --scope "" -- sh -c SCRIPT sh
COMMAND ARGS…`: SecretSpec resolves the whole profile into the child
environment, and a fixed script derives `--environment`, `--site` and
`--product`, refuses empty or dash-leading targets, and `exec`s Forge. The
decision applies to these two commands only.

## Considered options

### 1. Keep the TypeScript-built environment (rejected for install and uninstall)

Preserves wrapper-side validation of resolved values and clearing of stale
ambient values, but rebuilds in `configured.ts` what `secretspec run` provides,
for commands that need nothing else from the resolved values.

### 2. Delegate to `secretspec run` (chosen for install and uninstall)

The script is a static string. The command and forwarded arguments arrive as
positional parameters, so no caller text is interpolated. `--scope ""` keeps an
ambient `SECRETSPEC_SCOPE` from narrowing the profile, as it does for `export`.

### 3. Delegate deploy and tunnel the same way (rejected)

Both need resolved values in Fence Rider's own hands: deploy passes each runtime
value as an argument to `forge variables set`, tunnel renames runtime members to
`FORGE_USER_VAR_<name>`, and both validate the whole configuration before the
first remote change or Forge call. A generated shell program would carry that
logic with weaker tests and error stages.

## Consequences

- Install and uninstall lose the wrapper's clearing of stale ambient values for
  unresolved optional declarations: `secretspec run` leaves them in place.
- They also lose wrapper-side validation of resolved values (string typing and
  NUL-free); SecretSpec's own behavior applies.
- An exported variable that the profile neither declares nor resolves stays
  visible to Forge and acts as a fallback, so an exported `FORGE_SITE` fills a
  gap. A resolved value overrides an exported one.
- They make one SecretSpec resolution, with no `schema`, `export` or scope
  `check` calls.
- `sh` must be present. Windows is already unsupported.
