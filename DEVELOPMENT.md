# Development

Use Bun 1.4.3 for dependencies, scripts, tests, and compiled builds:

```sh
bun install
bun run test
bun run typecheck
bun run build
./dist/fence-rider --help
```

## Test tiers

Tests live in two tiers under `tests/`, with shared helpers in `tests/support/`.

| Tier | Location | What runs | Speed |
| --- | --- | --- | --- |
| Unit | `tests/unit/` | In-process calls to `main`, with no subprocesses | A fraction of a second for the whole tier |
| Integration | `tests/integration/` | Real processes: the compiled CLI, fake or real tools on `PATH`, signals, installed packages | Seconds; each file runs in its own worker |

Integration tests are grouped by what they need to run:

| Group | Location | Needs installed | Script |
| --- | --- | --- | --- |
| Real SecretSpec | `tests/integration/real-secretspec/` | SecretSpec 0.21.1 on `PATH` | `bun run test:integration:native` |
| Fake tools | `tests/integration/fake-tools/` | Nothing: the compiled CLI and spawned processes run against fake SecretSpec and Forge on `PATH` | `bun run test:integration:fakes` |

Each file name states its subject and the command it exercises.

Rule of thumb: output and decisions are unit tests; real processes, signals,
`PATH` and installed packages are integration tests. Start with a unit test and
move to integration only when the behavior cannot be seen in-process.

`Io` (`src/io.ts`) is the seam between the tiers. It carries everything a
command touches outside its own process: stdout and stderr, the environment,
`PATH` lookup, file reads and helper-tool calls. `src/index.ts` passes the real
`consoleIo`; unit tests pass their own.

To test a new command in-process, call its public entry point, `main` in
`src/cli.ts`, with an `Io` built from `recordingIo()` in
`tests/support/main.ts`. Override `which`, `readFile`, `capture` or `env` on that
`Io` to supply fake tools and files, then assert on the exit code and the
recorded output. `runMain(args)` does this with the default `Io`. Pass the output
and helper calls in rather than patching modules or globals. `tests/unit/doctor.test.ts`
is a worked example.

Integration tests observe status, safe output, argument boundaries, child
environments, and process cleanup, not private helpers. They need no
credentials, network, vault, or real Forge app. Synthetic fixture files and
interaction records are removed after the suite.

`bun run test` runs the files in parallel worker processes. Integration files
that need the compiled CLI build it through `useBuiltCli()` in
`tests/support/cli.ts`, into a private workspace. New tests must use per-test
temp directories and avoid fixed ports, a shared cwd, or other shared mutable
state.

When SecretSpec is on `PATH`, the suite also runs native synthetic dotenv
integration checks (`tests/integration/real-secretspec/`). Install SecretSpec
0.21.1 separately to reproduce that evidence. Without it, `bun run test` skips
the native checks and prints how many (`tests/support/native-gate.ts`): a green
controlled suite alone does not certify SecretSpec compatibility. The forced
gate (`bun run check`, and so the pre-push hook) sets
`FENCE_RIDER_REQUIRE_NATIVE=1` in the `test:check` script, which turns a missing
SecretSpec into a failure naming the required version. You need SecretSpec
0.21.1 on `PATH` to push. POSIX interruption checks are skipped on Windows; Windows
process-tree cleanup is not certified.

Both fake SecretSpecs, the in-process one (`tests/support/fake-io.ts`) and the
spawned one (`tests/support/fake-tool.ts`), take the standard profile and the
schema, export and scope-membership answers from one module,
`tests/support/secretspec-answers.ts`. The native contract test
(`tests/integration/real-secretspec/secretspec-contract.test.ts`) compares
those answers with what real SecretSpec prints for the same profile, so a
change in either shows up there rather than as a product break the fakes hide.
When you change an answer shape, expect that test to fail until the shape
matches SecretSpec.

`tests/integration/fake-tools/check-script.test.ts` exercises validation output
and statuses with isolated tools and passing/failing Bun fixtures. No nested full-suite
invocation is needed. Scenario IDs are defined in the
[acceptance criteria](docs/reference/acceptance-criteria.md).

## Installed-package delivery checks

The package executable requires Bun 1.4.3+, and both the packaged and compiled
CLIs find SecretSpec and Forge on `PATH`. Packaging tests in
`tests/integration/fake-tools/packaged-consumer-discovery.test.ts` and
`tests/integration/real-secretspec/packaged-consumer-scripts.test.ts` pack a
local artifact, install it with lifecycle scripts blocked, and invoke its
installed executable in isolated
consumers with controlled tools. Native installed checks additionally require
SecretSpec on `PATH`; without it they skip, not pass. They remove
consumer fixtures and never publish or contact Forge.
See [delivery evidence and limits](docs/reference/installation.md). Installed
consumer acceptance reads the checked-in `docs/examples` scripts/declarations
rather than maintaining a second script specification; all seven workflows and
a controls-only variant run with native SecretSpec and controlled Forge.
[Tested versions and evidence](docs/reference/validation.md) separates
controlled, native, interface and blocked live results.

## Validation commands

| Command | Purpose |
| --- | --- |
| `bun run test` | Full test suite with normal passing-test output |
| `bun run test:check` | Same tests; only failures and totals are displayed |
| `bun run test:unit` | Unit tier only: in-process, no subprocesses |
| `bun run test:integration` | Integration tier only: both groups below |
| `bun run test:integration:native` | Integration tests that need real SecretSpec (`real-secretspec/`) |
| `bun run test:integration:fakes` | Integration tests that run against fake tools on `PATH` (`fake-tools/`) |
| `bun run test:coverage` | Coverage report for inspection |
| `bun run test:watch` | Interactive test feedback |
| `bun run lint` | Biome, formatting, typecheck, and Fallow in parallel |
| `bun run lint:docs` | All Markdown and spelling checks |
| `bun run check` | Forced pre-push gate: tests (failing if SecretSpec is missing) and lint |
| `bun run build` | Compiled CLI at `dist/fence-rider` |

Fallow still fails on dead-code, duplication, or health thresholds as before;
quiet success does not disable analyses. Its stdout/stderr are retained and
printed on any nonzero status, including tool errors. Run
`bunx --no-install fallow` to inspect a successful full report voluntarily.
`check` uses Bun's `--only-failures`; ordinary `test` remains verbose.

## Runbook

### Check gates

| Gate | Runs | Passes when |
| --- | --- | --- |
| `bun run check` | `lint` and `test:check` in parallel | Both pass; the pre-push hook runs it |
| `bun run lint` | Biome lint, Biome format check, typecheck and Fallow in parallel | All four pass |
| `bun run test:check` | `test` with `FENCE_RIDER_REQUIRE_NATIVE=1` and `--only-failures` | Every test passes, with SecretSpec 0.21.1 on `PATH` |
| `bun run lint:docs` | markdownlint and cspell over every Markdown file | No findings |

`check` does not run `lint:docs` or `build`; run them yourself after touching
documentation or `src/`. Fallow prints nothing on success and its full output on
any nonzero status; run `bunx --no-install fallow` for a full report. Do not
raise thresholds or suppress findings to make a gate pass.

### Known validation failures

| Symptom | Cause | Fix |
| --- | --- | --- |
| `check` fails naming SecretSpec 0.21.1 | Not installed, or not on `PATH`, with the native gate forced | Install SecretSpec 0.21.1 separately |
| `bun run test` reports skipped native tests | Same, without the forced gate | A skipped run is not native evidence; install SecretSpec |
| `docs.test.ts` fails on `docs/reference/command-help.md` | A command's usage text changed | Update the page, see below |
| `docs.test.ts` fails on "usage text ... does not appear in" | A docs page repeats a line of command usage | Link to the command help page instead |
| `lint` fails in parallel with a cancelled typecheck | Fail-fast cancelled it after Fallow failed | Run `bun run typecheck` alone |

### Bump a tested tool version

1. Install the new version and run `bun run check`. Fix what breaks, including
   `tests/support/secretspec-answers.ts` if the contract test reports a changed
   answer shape.
2. Update `tested` in the tool table in `src/doctor.ts`; change `lowest` only if
   you exercised the older release.
3. Update the version table and source findings in
   [tested versions](docs/reference/validation.md), and the version in the test
   tier tables above.
4. Run `bun run lint:docs`.

### Add a command

1. Implement the command in its own `src/<name>.ts`, exporting a `<name>Usage`
   string and a `run`-shaped function that takes arguments and `Io`.
2. Add it to the `commands` table in `src/commands.ts` with a `summary`, `usage`
   and `run`; `main` dispatches from that table and top-level help lists it.
3. Write a unit test through `main`; add an integration test only for what needs
   a real process.
4. Add the command to the `commands` list in `tests/unit/docs.test.ts` and to
   [command help](docs/reference/command-help.md), then document its contract in
   [the reference](docs/reference/reference.md) and, if it has scenarios, the
   [acceptance criteria](docs/reference/acceptance-criteria.md).

### Update the command help page

The command table in `src/commands.ts` is the only place usage text is wired. Run
`./dist/fence-rider help <command>` after `bun run build` and paste the output
verbatim into the matching `text` block in
[command help](docs/reference/command-help.md); `tests/unit/docs.test.ts`
fails until they match. Other pages link there rather than restating usage.

## Repository layout

- `src/index.ts`: the executable entry; runs `main` with the real `consoleIo`.
- `src/cli.ts`: `main`, the public entry point: help, version and command
  dispatch, with output and helper calls taken from `Io`.
- `src/io.ts`: the `Io` seam for output, environment, `PATH`, files and helpers.
- `src/configured.ts`: native profile resolution for `variables`, scope
  membership queries, manifest checks, child environments, and the value-free
  name queries the tunnel generator makes.
- `src/shell.ts`: shell quoting and the `secretspec run` script that `lint`,
  `deploy`, `tunnel`, `install` and `uninstall` print; pure strings, so tests
  need no processes.
- `src/doctor.ts`: tool version ranges, the unrecognized-scope warning and the
  manifest-scope check.
- `src/deploy.ts`: prints the script that runs `forge deploy` under
  `secretspec run`; it uploads nothing.
- `src/variables.ts`, `src/variables-plan.ts`: the one Bun-supervised
  workflow besides `doctor`; encrypts and uploads the runtime-scope values.
- `src/tunnel.ts`, `src/tunnel-plan.ts`: prints the `forge tunnel` script with
  a prologue mapping runtime members to `FORGE_USER_VAR_<name>`.
- `src/target.ts`: the `-e, --environment` option shared by deploy and
  variables.
- `src/lint.ts`: prints the script that runs `forge lint` under
  `secretspec run`; Fence Rider supervises nothing.
- `src/install.ts`: prints the install/uninstall script, with a fixed target
  script, refusal of target options and no automatic synchronization.
- `tests/unit/`, `tests/integration/`: the two test tiers; `tests/support/`
  holds shared fixtures, fakes and runners.
- `docs/`: task guides, reference, and architectural explanation.
- `specs/`: planned future work; see `specs/README.md`. Current behavior is
  documented in `docs/`, with scenario IDs in
  `docs/reference/acceptance-criteria.md`.

Never use real credentials in test fixtures. Live Forge checks require a
separately authorized named disposable app, environment, allowed changes,
and cleanup scope. No ordinary test or `check` contacts Forge.
