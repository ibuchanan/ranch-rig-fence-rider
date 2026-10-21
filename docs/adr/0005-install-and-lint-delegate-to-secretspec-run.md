---
status: superseded by ADR 0006 in how it is executed
---

# Run install, uninstall and lint under `secretspec run`

> Execution superseded by
> [ADR 0006](0006-generate-shell-for-lint-install-uninstall.md): these commands
> no longer run `secretspec run` themselves but print the script that does, and
> lint's manifest check moved to `fence-rider doctor`. The rationale below for
> delegating to `secretspec run` still stands.

`fence-rider install`, `uninstall` and `lint` used to resolve the profile
themselves (`secretspec schema` and `export`), validate and type the values,
and build the Forge environment in TypeScript. For install and uninstall, with
their option parsing gone ([ADR 0004](0004-install-targets-from-profile-only.md)),
all that remained was three expansions and a pass-through. Lint never needed
more than the environment. `secretspec run` already provides it, so these
commands now run `secretspec run --scope "" -- …`: SecretSpec resolves the whole
profile into the child environment.

- Install and uninstall run `sh -c SCRIPT sh COMMAND ARGS…`. A fixed script
  derives `--environment`, `--site` and `--product`, refuses empty or
  dash-leading targets, and `exec`s Forge.
- Lint runs `forge lint ARGS…` directly. It injects no targets, so it needs no
  script.

The decision applies to these three commands only.

## Considered options

### 1. Keep the TypeScript-built environment (rejected for these three)

Preserves wrapper-side validation of resolved values and clearing of stale
ambient values, but rebuilds in `configured.ts` what `secretspec run` provides,
for commands that need nothing else from the resolved values.

### 2. Delegate to `secretspec run` (chosen for install, uninstall and lint)

The install script is a static string. The command and forwarded arguments
arrive as positional parameters, so no caller text is interpolated. `--scope ""`
keeps an ambient `SECRETSPEC_SCOPE` from narrowing the profile, as it does for
`export`.

### 3. Delegate deploy and tunnel the same way (rejected)

Both need resolved values in Fence Rider's own hands: deploy passes each runtime
value as an argument to `forge variables set`, tunnel renames runtime members to
`FORGE_USER_VAR_<name>`, and both validate the whole configuration before the
first remote change or Forge call. A generated shell program would carry that
logic with weaker tests and error stages.

## Consequences

- These commands lose the wrapper's clearing of stale ambient values for
  unresolved optional declarations: `secretspec run` leaves them in place.
- They also lose wrapper-side validation of resolved values (string typing and
  NUL-free); SecretSpec's own behavior applies.
- An exported variable that the profile neither declares nor resolves stays
  visible to Forge and acts as a fallback, so an exported `FORGE_SITE` fills a
  gap. A resolved value overrides an exported one.
- Install and uninstall make one SecretSpec resolution, with no `schema`,
  `export` or scope `check` calls. Lint makes two: the optional manifest-scope
  `check`, then the `run`.
- Lint's manifest check now precedes `secretspec run`. A required value missing
  from the `manifest` scope is therefore reported generically by the scope check
  stage ("SecretSpec manifest scope membership"), not by SecretSpec's own error.
  Any other missing required value is reported by SecretSpec's own error from
  `run`, before Forge starts.
- `sh` must be present for install and uninstall. Windows is already
  unsupported.
