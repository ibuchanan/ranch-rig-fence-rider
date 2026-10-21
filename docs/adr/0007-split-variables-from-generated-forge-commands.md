---
status: accepted
---

# Split variable handling from the generated Forge command

[ADR 0006](0006-generate-shell-for-lint-install-uninstall.md) left `deploy`
and `tunnel` as Bun workflows because both needed resolved values in Fence
Rider's own hands: deploy passed each runtime value as an argument to
`forge variables set` before `forge deploy`, and tunnel renamed runtime members
to `FORGE_USER_VAR_<name>`. Those workflows kept the process supervision, fake
binaries and flaky interruption tests that the other three commands had shed.
Forge itself keeps the two deploy steps independent, so a changed variable was
always uploaded with every deploy, and an unchanged one was uploaded again.

Each flow now splits in two:

1. **Variable handling**, the part that needs values or names.
   - `fence-rider variables [-e TARGET]` is the only Bun-supervised workflow
     that touches values. It resolves the whole profile, runs the optional
     manifest check, validates the runtime selection, and runs
     `forge variables set --encrypt` for each runtime member. It accepts no
     Forge options.
   - `fence-rider tunnel` asks SecretSpec, value-free, for the declared names
     (`secretspec schema`) and the runtime members
     (`secretspec check --json --scope runtime`) while printing, and bakes a
     shell prologue into the script that removes ambient `FORGE_USER_VAR_*`
     entries and maps each runtime member to `FORGE_USER_VAR_<name>`.
2. **Generated command**, as for lint and install: `deploy` and `tunnel` print
   one `exec secretspec run --scope '' -- sh -c … forge <command> --environment
   …` script. The environment is `-e/--environment`, else the profile's
   `FORGE_ENVIRONMENT`, else `development`, and the script refuses an empty or
   dash-leading one. Forwarded options are quoted into the script.

`deploy` no longer uploads. A package script that wants both chains them:

```json
"release": "fence-rider variables && cmd=$(fence-rider deploy) && sh -c \"$cmd\" sh"
```

## Considered options

### 1. Deploy keeps owning the upload (previous, rejected)

Every deploy rewrote every runtime variable, so a code-only change contacted
the variable store and could fail half way, and the independence that Forge's
own CLI offers was lost.

### 2. Generate the upload as shell (rejected)

The script could loop over the runtime names and call `forge variables set`.
But the manifest check, the refusal of empty and dash-leading values, and the
partial-upload warning would move into shell with weaker tests, and a value
would have to be read back from the environment by the script rather than
validated before the first write.

### 3. A `deploy --upload` flag (rejected)

It keeps one command but keeps the Bun supervision and the mixed contract:
deploy would sometimes print a script and sometimes write remotely, and a flag
named for uploading hides that the upload is the risky part.

### 4. Separate `variables` command plus generated deploy and tunnel (chosen)

Mirrors `forge variables set` and `forge deploy`, leaves one Bun workflow that
handles values, and makes the other four forge commands pure string generators.

## Consequences

- ADR 0006's deferral of generating all five commands is superseded in part:
  deploy and tunnel are generated. Uploading stays in Bun, by design.
- Forgetting `variables` before `deploy` leaves stale remote values. The
  documented `release` script chains them, and the `&&` stops the deploy if
  an upload fails.
- The tunnel generator reads SecretSpec while printing, unlike the other
  generators, though only names and never values. A SecretSpec failure prints
  the reason on stderr and nothing on stdout, so a guarded script stops.
- The mapping names are fixed when the script is printed. If the runtime scope
  changes, print the script again; a package script does so on every run.
- Ambient `FORGE_USER_VAR_` names are cleared only when they consist of
  letters, digits and underscores.
- The optional manifest check no longer runs in `deploy` or `tunnel`; `variables`
  and `fence-rider doctor` run it.
- Process supervision, interruption and `DelegatedFailure` exit-code
  propagation for deploy and tunnel are gone: the terminal signals
  `secretspec run` and Forge directly, and `exec` preserves their statuses.
  Only `variables` and `doctor` remain supervised.
- `deploy` can fail inside `secretspec run`, before Forge, if a required value
  is unresolved; it never validates values itself.
