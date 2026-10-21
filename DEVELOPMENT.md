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
integration checks (`tests/integration/native-*.test.ts`). Install SecretSpec
0.21.1 separately to reproduce that evidence. Without it, `bun run test` skips
the native checks and prints how many (`tests/support/native-gate.ts`): a green
controlled suite alone does not certify SecretSpec compatibility. The forced
gate (`bun run check`, and so the pre-push hook) sets
`FENCE_RIDER_REQUIRE_NATIVE=1` in the `test:check` script, which turns a missing
SecretSpec into a failure naming the required version. You need SecretSpec
0.21.1 on `PATH` to push. POSIX interruption checks are skipped on Windows; Windows
process-tree cleanup is not certified.

`tests/integration/check.test.ts` exercises validation output and statuses with
isolated tools and passing/failing Bun fixtures. No nested full-suite
invocation is needed. The acceptance map is in the
[deployment evidence reference](docs/reference/deployment.md).

## Installed-package delivery checks

The package executable requires Bun 1.4.3+, and both the packaged and compiled
CLIs find SecretSpec and Forge on `PATH`. Packaging tests in
`tests/integration/packaged-consumer.test.ts` pack a local artifact, install it
with lifecycle scripts blocked, and invoke its installed executable in isolated
consumers with controlled tools. Native installed checks additionally require
SecretSpec on `PATH`; without it they skip, not pass. They remove
consumer fixtures and never publish or contact Forge.
See [delivery evidence and limits](docs/reference/installation.md). Installed
consumer acceptance reads the checked-in `docs/examples` scripts/declarations
rather than maintaining a second script specification; all seven workflows and
a controls-only variant run with native SecretSpec and controlled Forge.
The [CW evidence map](docs/reference/consumer-workflows.md) separates controlled,
native, interface and blocked live results.

## Validation commands

| Command | Purpose |
| --- | --- |
| `bun run test` | Full test suite with normal passing-test output |
| `bun run test:check` | Same tests; only failures and totals are displayed |
| `bun run test:unit` | Unit tier only: in-process, no subprocesses |
| `bun run test:integration` | Integration tier only: real processes and tools on `PATH` |
| `bun run test:coverage` | Coverage report for inspection |
| `bun run test:watch` | Interactive test feedback |
| `bun run lint` | Biome, formatting, typecheck, and Fallow in parallel |
| `bun run lint:fallow` | Full Fallow gate; report displayed only on failure |
| `bun run lint:docs` | All Markdown and spelling checks |
| `bun run check` | Forced pre-push gate: tests (failing if SecretSpec is missing) and lint; optional size/pack scripts are currently absent |
| `bun run build` | Compiled CLI at `dist/fence-rider` |

Fallow still fails on dead-code, duplication, or health thresholds as before;
quiet success does not disable analyses. Its stdout/stderr are retained and
printed on any nonzero status, including tool errors. Run
`bunx --no-install fallow` to inspect a successful full report voluntarily.
`check` uses Bun's `--only-failures`; ordinary `test` remains verbose.

`check` does not include documentation lint or build, so run those separately.
The current `check` passes after the Fallow cleanup; historical failures and
current results are recorded in the [validation record](docs/reference/validation.md).
Documentation lint also passes after the formatting cleanup; run it separately
because it is not included in `check`.
Do not raise thresholds or suppress findings to make a gate pass.

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
- `specs/fence-rider-spec.md`: product contract and AC-01 through AC-18.

Never use real credentials in test fixtures. Live Forge checks require a
separately authorized named disposable app, environment, allowed changes,
and cleanup scope. No ordinary test or `check` contacts Forge.
