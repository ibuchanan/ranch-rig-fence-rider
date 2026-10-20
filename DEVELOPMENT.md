# Development

Use Bun 1.4.3 for dependencies, scripts, tests, and compiled builds:

```sh
bun install
bun run test
bun run typecheck
bun run build
./dist/cli --help
```

## Public test boundaries

`tests/cli.test.ts` builds the real CLI and invokes it in isolated projects
with controlled executables. Tests observe status, safe output, argument
boundaries, child environments, and process cleanup, not private helpers.
They need no credentials, network, vault, or real Forge app. Synthetic
fixture files and interaction records are removed after the suite.

When SecretSpec is on `PATH`, the same suite also runs native synthetic
dotenv integration checks. Install SecretSpec 0.21.1 separately to reproduce
that evidence. Without it, native checks are skipped: a green controlled
suite alone does not certify SecretSpec compatibility. POSIX interruption
checks are skipped on Windows; Windows process-tree cleanup is not certified.

`tests/check.test.ts` exercises validation output and statuses with isolated
tools and passing/failing Bun fixtures. No nested full-suite invocation is
needed. The acceptance map is in the
[deployment evidence reference](docs/reference/deployment.md).

## Installed-package delivery checks

The package executable requires Bun 1.4.3+ and explicit `fence-rider setup`;
standalone compiled tests retain PATH-based tools. Packaging tests in
`tests/cli.test.ts` pack a local artifact, install it with lifecycle scripts
blocked, and invoke its installed executable in isolated consumers. Native setup
checks additionally require pinned release assets in `SECRETSPEC_TEST_ASSETS`;
without them they skip, not pass. Provide `secretspec-installer.sh` and the host's
native archive from SecretSpec 0.21.1. Tests serve those exact bytes over loopback,
verify checksums, and remove consumer fixtures. They never publish or contact
Forge.
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
| `bun run test:coverage` | Coverage report for inspection |
| `bun run test:watch` | Interactive test feedback |
| `bun run lint` | Biome, formatting, typecheck, and Fallow in parallel |
| `bun run lint:fallow` | Full Fallow gate; report displayed only on failure |
| `bun run lint:docs` | All Markdown and spelling checks |
| `bun run check` | Forced pre-push gate: tests and lint; optional size/pack scripts are currently absent |
| `bun run build` | Compiled CLI at `dist/cli` |

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

- `src/index.ts`: CLI discovery and command dispatch.
- `src/configured.ts`: single-file validation, native profile resolution,
  manifest checks, child environments, stdio policy, and process cleanup.
- `src/deploy.ts`: target options and encrypted deployment lifecycle.
- `src/lint.ts`: configured lint with live output without redaction and
  inherited input.
- `src/install.ts`: shared install/uninstall targets and execution, with
  command-specific option grammar and no automatic synchronization.
- `tests/`: compiled CLI and validation-command behavior.
- `docs/`: task guides, reference, and architectural explanation.
- `specs/fence-rider-spec.md`: product contract and AC-01 through AC-18.

Never use real credentials in test fixtures. Live Forge checks require a
separately authorized named disposable app, environment, allowed changes,
and cleanup scope. No ordinary test or `check` contacts Forge.
