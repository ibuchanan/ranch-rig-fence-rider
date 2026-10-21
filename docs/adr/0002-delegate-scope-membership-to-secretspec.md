---
status: accepted
---

# Ask SecretSpec for scope membership instead of parsing `secretspec.toml`

Fence Rider needs the members of the `manifest` and `runtime` scopes. It used to
read them from the TOML itself, which duplicated part of SecretSpec's model and
forced it to reject `project.extends`: scopes defined in a parent file would
have been invisible, so `deploy` could silently upload nothing. Fence Rider now
resolves the whole profile once and asks SecretSpec for each scope's members
with the value-free `secretspec check --json --scope NAME`. It passes no
`--file` or `--profile`; SecretSpec reads `SECRETSPEC_FILE` and
`SECRETSPEC_PROFILE` itself. This keeps inheritance, scope placement and scope
validation in SecretSpec, in line with not recreating SecretSpec behavior.

## Considered options

### 1. Keep the TOML parse and reject `project.extends` (rejected)

Cheap and fail-loud, but it reimplements scope and declaration rules, only
supports a single file, and duplicates file and profile selection that
SecretSpec already provides (including its walk-up file detection).

### 2. Delegate through `check --json --scope` (chosen)

The report is value-free, so no secret values cross the pipe, and it lists
optional declarations that have no value. That keeps the manifest check covering
an absent optional member, as before.

### 3. Delegate through `export --scope` (rejected)

Gives the same names but prints values and omits absent optional members, which
would narrow the manifest check.

## Consequences

- A run makes up to three SecretSpec resolutions: the whole profile, then
  `manifest` and/or `runtime` where the workflow uses them (`manifest`: lint,
  deploy, tunnel; `runtime`: deploy, tunnel; none for install or uninstall).
  This costs latency and, for vault providers, extra authentication prompts and
  audit entries. Values still come only from the single whole-profile export,
  so copies of a shared value cannot diverge.
- A scope the file does not define has no members (no `runtime` scope means no
  uploads). SecretSpec reports this only as an error containing
  "is not defined in secretspec.toml", so Fence Rider matches that stderr text.
  It is the one contract on error text, and it never prints that stderr.
- `manifest.yml` is read only when the manifest scope has members.
- `fence-rider doctor` keeps a small advisory TOML read of `SECRETSPEC_FILE` or
  `./secretspec.toml` to warn about scopes other than `manifest` and `runtime`.
  It does not see scopes inherited from other files, and an unparsable file
  only skips that check with a warning.
