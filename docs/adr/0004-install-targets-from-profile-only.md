---
status: accepted
---

# Take install and uninstall targets from the profile only

> The profile-default requirement remains, but explicit target overrides are
> now accepted in the Forge argument tail after `--`. See the current
> [installation contract](../reference/reference.md#configured-installation).
> The options below record the original, stricter decision.

`fence-rider install` and `fence-rider uninstall` used to read `-e`, `-s` and
`-p` (and their long forms) themselves and merge them with the resolved
`FORGE_ENVIRONMENT`, `FORGE_SITE` and `FORGE_PRODUCT`. They now take the three
targets from the resolved profile alone and refuse those options before any tool
is called. Someone who needs explicit control writes the command with
`secretspec` and `forge` directly. This keeps option parsing and precedence out
of Fence Rider for the two workflows that need nothing else from the command
line. The commands are implemented by running Forge under `secretspec run` with
a fixed shell script that derives the three targets from the child environment
([ADR 0005](0005-install-and-lint-delegate-to-secretspec-run.md)).

## Considered options

### 1. Keep `-e`/`-s`/`-p` parsing with profile fallback (rejected)

Convenient for ad-hoc targets, but it needs a parser for every spelling
(`--site=x`, `-sx`, duplicates, `--`), a precedence rule and validation, all of
which duplicate what `secretspec` plus `forge` already provide.

### 2. Refuse the options and let users call secretspec and forge directly (chosen)

The wrapper still recognizes the three options, but only to reject them with a
message that names the profile controls and the direct route.

### 3. Accept and forward them (rejected)

Fence Rider injects `--environment`, `--site` and `--product` itself, so a
forwarded copy would reach Forge as a duplicate option with unclear precedence.

## Consequences

- Ad-hoc overrides are gone. To aim elsewhere, use another profile or edit the
  declaration, or run the command directly, for example
  `secretspec run -- forge install --environment … --site … --product …`.
- The direct route is now almost what the wrapper itself runs. The remaining
  difference is the target script: the wrapper's refuses an empty or
  dash-leading target and defaults only the environment.
- The fixed script, not TypeScript, checks that each of the three targets is
  nonempty and does not start with `-`; Forge validates what the values mean.
