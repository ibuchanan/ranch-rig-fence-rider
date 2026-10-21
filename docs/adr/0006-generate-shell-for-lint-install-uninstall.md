---
status: accepted
---

# Print a shell script for lint, install and uninstall instead of running Forge

> Partly superseded by
> [ADR 0007](0007-split-variables-from-generated-forge-commands.md): deploy and
> tunnel now print scripts too, once variable upload is a separate command.
> Option 4 below is no longer deferred.

After [ADR 0005](0005-install-and-lint-delegate-to-secretspec-run.md), `lint`,
`install` and `uninstall` were only a thin Bun process that spawned
`secretspec run` and supervised it: process groups, signal escalation, exit
status propagation and live stdio. That supervision was the source of the flaky
interruption tests and needed fake binaries and process spawning to test. These
commands now print one shell script on stdout, and a package script runs it:

```text
exec secretspec run --scope '' -- forge lint <quoted args> "$@"
```

Install and uninstall wrap the fixed target-deriving script from ADR 0005 in the
same `exec secretspec run` form. Arguments given to `fence-rider` are
shell-quoted into the script, and arguments a script runner appends arrive as
`"$@"`. The documented package script assigns the output to a variable and runs
it with `sh -c` only if the generator succeeded (see the
[short scripts](../how-to/consumer-workflows.md)). Deploy and tunnel are
unchanged: Bun still resolves, validates and supervises them.

## Considered options

### 1. Bun supervises `secretspec run` (previous, rejected for these three)

Works, but a wrapper process sits between the terminal and the tools only to
forward signals and statuses that `exec` gives for free, and every behavior needs
a spawned process to test.

### 2. Print a script (chosen for lint, install and uninstall)

The generator is a pure function from arguments to a string, so its tests assert
on strings and need no processes. `exec` replaces the shell, so signals, the exit
status and interactive stdin belong to `secretspec run` and Forge. Generated text
refers to the environment that `secretspec run` provides, so it never contains a
value.

### 3. Documentation recipes only (rejected)

Writing `secretspec run --scope '' -- forge lint "$@"` in `package.json` by hand
needs no generator. But the wrapper still adds the install and uninstall target
derivation and validation, the refusal of target options, and correct quoting of
embedded options, and gives one place to change them.

### 4. Generate all five commands (deferred)

Deploy and tunnel need resolved values in Fence Rider's own hands: deploy passes
each runtime value as an argument to `forge variables set`, tunnel renames
runtime members to `FORGE_USER_VAR_<name>`, and both validate the whole
configuration before the first remote change. A generated program would carry
that logic as shell with weaker tests and error stages.

## Consequences

- A package script must guard the generator with `&&`. An unguarded
  `eval "$(fence-rider lint)"` evaluates an empty string and exits 0 when the
  generator refuses, so a refusal would pass silently.
- Refusals print the reason on stderr and nothing on stdout, and exit 1, so the
  guard stops the script. `sh -c "$cmd" sh` runs the script rather than `eval`
  so appended arguments are parsed once, as `"$@"`.
- Fence Rider no longer checks `PATH` for these commands; a missing tool is the
  shell's "command not found" when the script runs, and `fence-rider doctor`
  reports the tools.
- The optional manifest-scope check for lint moved to `fence-rider doctor`
  because a generator should not read providers or `manifest.yml` while
  generating. Doctor now asks SecretSpec, value-free, for the manifest scope's
  members when the file declares that scope, so it reads providers. Deploy and
  tunnel keep running the check.
- Process-supervision and interruption tests for these commands are gone; the
  terminal signals `secretspec run` and Forge directly. They remain for deploy
  and tunnel.
- Generated text never contains a value; a quoting function with property tests
  guards every embedded argument.
