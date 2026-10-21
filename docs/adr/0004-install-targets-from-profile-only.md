---
status: accepted
---

# Take install and uninstall targets from the profile only

`fence-rider install` and `fence-rider uninstall` used to read `-e`, `-s` and
`-p` (and their long forms) themselves and merge them with the resolved
`FORGE_ENVIRONMENT`, `FORGE_SITE` and `FORGE_PRODUCT`. They now take the three
targets from the resolved profile alone. If one of those options is given to
the generator, it is dropped, with its value, and a note on stderr names it;
the script is still printed and the exit status is 0. Someone who needs
explicit control sets the profile or an exported `FORGE_*` variable, or writes
the command with `secretspec` and `forge` directly. This keeps option parsing
and precedence out of Fence Rider for the two workflows that need nothing else
from the command line. The commands print a script that runs Forge under
`secretspec run` with a fixed shell script that derives the three targets from
the child environment ([ADR 0005](0005-install-and-lint-delegate-to-secretspec-run.md),
[ADR 0006](0006-generate-shell-for-lint-install-uninstall.md)).

An earlier version of this decision refused the options before any tool was
called. Dropping them with a note supersedes that, for the reason below.

## Considered options

### 1. Keep `-e`/`-s`/`-p` parsing with profile fallback (rejected)

Convenient for ad-hoc targets, but it needs a parser for every spelling
(`--site=x`, `-sx`, duplicates, `--`), a precedence rule and validation, all of
which duplicate what `secretspec` plus `forge` already provide.

### 2. Refuse the options (superseded by option 3)

The wrapper recognized the three options only to reject them with a message that
named the profile controls and the direct route. It failed loudly, but a
generator controls only what it embeds: it cannot refuse the same option when a
script runner appends it later, so refusing in one place and not the other gave
an inconsistent rule.

### 3. Drop the options with a note on stderr (chosen)

The generator never embeds the three options, so the script cannot contain a
second copy that it injected itself. The stderr note keeps a typed
`--site x` from silently installing to the profile's site. It does not block
the guarded script, because the script and exit status are unchanged.

### 4. Accept and forward them (rejected)

Fence Rider injects `--environment`, `--site` and `--product` itself, so a
forwarded copy would reach Forge as a duplicate option with unclear precedence.

## Consequences

- Ad-hoc overrides are gone. To aim elsewhere, use another profile, export a
  `FORGE_*` variable, edit the declaration, or run the command directly, for
  example `secretspec run -- forge install --environment … --site … --product …`.
- Options that a script runner appends after `sh` in a `package.json` script are
  not inspected. They reach Forge as given through `"$@"` and can duplicate the
  injected targets. Fence Rider cannot prevent this, as it cannot prevent a
  duplicate from anyone calling `forge` directly, so it is a documented
  limitation, not a tested guarantee at the integration level. The generator's
  own behavior is what is tested, in isolation.
- Malformed option parsing (for example a duplicated option or `-s=x`) still
  fails with nothing on stdout.
- The direct route is almost what the wrapper itself runs. The remaining
  difference is the target script: the wrapper's refuses an empty or
  dash-leading target and defaults only the environment.
- The fixed script, not TypeScript, checks that each of the three targets is
  nonempty and does not start with `-`; Forge validates what the values mean.
