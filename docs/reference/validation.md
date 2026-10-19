# Workflow validation record

Recorded 2026-10-19 for ticket 07. Public seams: the compiled CLI subprocess
and observable validation-command output/status, confirmed by the user.
No private-function tests or second native proof suite were introduced.

## Evidence levels

| Component | Exact baseline | Evidence and limits |
| --- | --- | --- |
| Bun | 1.4.3, macOS | Compiled CLI, TOML/YAML, subprocess and POSIX cleanup checks |
| SecretSpec | 0.21.1 | Native schema and full-profile dotenv export through compiled CLI; synthetic values only |
| Forge CLI | 14.2.0 | Prior installed help/source inspection plus official documentation; controlled delegation only |
| Fallow | 3.34.1 | Existing gate and isolated success/threshold/error reporting checks |

These are observed versions, not a supported version range. Only the dotenv
provider is exercised. Native tests skip when SecretSpec is unavailable;
POSIX interruption tests skip on Windows. Controlled Forge executables do
not establish server acceptance, encryption at rest, or runtime activation.

## Acceptance traceability

All named checks below are in [the public suite](../../tests/cli.test.ts).
Names identify tests rather than unstable line numbers. Each AC has passing
local evidence; references to Forge mean controlled subprocess observations
unless explicitly labeled native SecretSpec. This is not live certification.

| Criterion | Passing checks / observable evidence |
| --- | --- |
| AC-01 | `deploy resolves once, encrypts only runtime values, then deploys to the configured target`; `all encrypted writes complete before exactly one deployment` |
| AC-02 | `explicit environment overrides the configured target for every Forge command`; `deployment preserves unrelated options and CI arguments without changing boundaries` |
| AC-03 | Configured staging in `deploy resolves once...`; `missing configured target falls back to development for uploads and deployment` |
| AC-04 | `missing %s stops before any helper interaction`; `invalid configuration: $name fails with secret-safe diagnostics`; malformed native output and native resolution failure cases |
| AC-05 | `omitted runtime scope and empty active-profile intersection deploy without writes or deletion`; `rejects malformed scope metadata...`; native standalone/empty optional profiles and dotenv value cases |
| AC-06 | `failed upload for %s stops later writes and reports possible partial state`, including the second upload after a successful first |
| AC-07 | `delegated deployment preserves exit status %i without raw helper output` for 2/23/127/255; unlaunchable executables and child signal termination |
| AC-08 | `deploy resolves once...` asserts literal multiline, quoted, spaced, shell-syntax argument preservation and absence of the injected file |
| AC-09 | `helper exception during %s never leaks stdout stderr or error details`; `resolution, upload, and deployment failures never report success or leak helper output`; shared fixture checks independent synthetic markers |
| AC-10 | No-command, help, version, unknown invocation, install, and tunnel cases all assert no external tool calls |
| AC-11 | `invalid or duplicate target %j fails before any tool call`; grouped short flags and target-like payload cases |
| AC-12 | Selective-upload exact interaction lists exclude undeclared values; site/product controls stay local; control upload selection fails; fixture file inventory asserts no generated secret files |
| AC-13 | `operator interruption...` across schema/export/upload/deploy with SIGINT/SIGTERM; `interruption cleans up descendants even when the active helper exits first` |
| AC-14 | `missing required %s blocks writes even without runtime selection`; native full-profile and manifest-requirement failures prevent every Forge command |
| AC-15 | `native full-profile validation blocks uploads when an unscoped requirement is missing`; native absent-optional case clears unknown ambient scope and preserves the full local environment |
| AC-16 | `native SecretSpec schema and full dotenv export share %s values and omit absent optionals`: exactly one export; identical local value and encrypted upload argument for either environment control |
| AC-17 | `omitted manifest scope does not require a manifest file or suppress local values`; `manifest scope checks declarations including absent optionals before uploads`: missing declaration blocks writes; strings and keyed objects accepted |
| AC-18 | Unsupported/malformed inheritance rejected before helpers; empty extends accepted; native inherited and standalone profiles exercised with identical explicit profile for schema/export |

## Validation-command regression checks

[Check tests](../../tests/check.test.ts) were added in red-green slices:

- A successful Fallow process originally printed its report. The wrapper
  now emits nothing on success and reproduces stdout/stderr on nonzero exit.
  Controlled statuses 1 (threshold) and 2 (tool error) are preserved exactly.
- The pre-push test command originally printed passing cases. It now runs
  `test:check`, composing normal `test` with Bun's `--only-failures`. Synthetic
  passing/failing suites verify hidden passes, visible failures and totals,
  and preserved success/failure statuses. Ordinary `test` stays verbose.

No dependency was added and no threshold, analysis category, or finding was
disabled. Fallow
has progress-only quiet and category-summary flags, but neither implements
failure-only reporting; the shell wrapper captures one run and reports it
on failure rather than rerunning analysis.

## Live Forge verification — blocked

The user explicitly selected **record as blocked**. No Forge command was
run or live app contacted during ticket 07. No app ID, environment, permitted
synthetic variables, deployment, or cleanup scope has been authorized.

Missing evidence: server-side acceptance and encrypted storage metadata for
synthetic variables in a named disposable development app/environment;
matching upload/deployment target identity; runtime use of the changed value
after deployment under Forge's documented activation lifecycle. A permitted
runtime observation must emit only a comparison result, not plaintext.
No remote state was created, so no remote cleanup was performed.

Local verification and documentation are complete only to their recorded
scope. Final end-to-end workflow readiness remains blocked, not proven by
the controlled suite. Follow the [authorization checklist](../how-to/how-to.md#arrange-a-live-smoke-test)
before any future live work.

## Repository check outcomes

The baseline CLI suite passed 154 tests with 1275 assertions and no failures;
all installed native SecretSpec checks ran. The baseline `check` failed on
seven existing Fallow complexity/estimated-coverage findings. Dead-code and
duplication passed. Baseline documentation lint reported 81 issues, including
scaffold policy documents, the placeholder README, product spec table
formatting, and the unchanged historical exploration.

| Ticket 07 command | Result |
| --- | --- |
| `bun run test:check` | PASS: 156 tests, zero failures, 1293 assertions; all installed native checks ran |
| `bun run check` | FAIL: same seven pre-existing Fallow health thresholds; tests pass, passing case names hidden, full Fallow failure report retained |
| `bun run typecheck` | PASS independently; fail-fast parallel lint may cancel this task after Fallow fails |
| `bun run format:check` | PASS, including the pre-existing TypeScript configuration formatting changes |
| `bun run lint:check` | PASS: Biome |
| `bun run build` | PASS; compiled help/version also pass without credentials |
| `bun run lint:docs` | FAIL: 55 pre-existing Markdown issues in unchanged CODE_OF_CONDUCT.md, CONTRIBUTING.md, SECURITY.md, and historical exploration; spelling step short-circuits |
| Targeted Markdown: README, DEVELOPMENT, all docs, product spec | PASS: nine documents, zero issues |
| Standalone full Markdown spelling check | PASS: 14 documents, zero issues |
| `git diff --check` | PASS |

The first parallel gate run exposed generated test fixtures to formatting.
Root subprocess fixture workspaces are now ignored by Git-aware checks;
the repeated gate reaches only the original Fallow health failure. Test
fixtures and build intermediates are cleaned up, not committed. Thresholds
and analysis categories remain unchanged. The pre-existing explanation,
reference, product specification, and configuration formatting changes are
preserved and included rather than left uncommitted.

A clean Git working tree is separate from a green validation gate. The local
scratch ticket records completion and the remaining live blocker; this
tracked page preserves the results in the commit.

## Fallow cleanup follow-up — 2026-10-19

The requested health cleanup now passes `bun run check` with exit status 0.
Fallow reports zero dead-code issues and zero functions above the existing
health thresholds. Cyclomatic 20, cognitive 15, and risk-score 30 limits are
unchanged; no suppression, baseline exemption, dependency, or analysis skip
was added. Quiet Fallow success and failure-only test reporting remain intact.

The deployment function now coordinates explicit configuration, resolution,
manifest validation, upload, and deployment phases using shared diagnostic
state. Native declarations, required membership, runtime values, options,
and subprocess exit status have focused validators. The test fixture now
separates project setup from invocation and reuses parent/descendant cleanup.
Public CLI tests remain the regression boundary; no private helpers are
exported just for tests and no fake coverage evidence was added.

Fallow's static coverage estimate still cannot observe compiled subprocess
tests. The refactoring reduces per-function branching rather than changing
that model or claiming measured runtime coverage. This redistributes some
existing decisions into named responsibilities; it does not claim the
workflow has fewer total decisions.

The complete existing 156-test suite passes with 1293 assertions. Biome lint,
formatting, typecheck, and compiled build pass. The historical whole-doc lint
issues are outside `check` and remain separate. Live Forge verification is
still blocked; no live app was contacted during this cleanup.

## Markdown cleanup follow-up — 2026-10-19

The remaining 55 Markdown findings are resolved without changing lint rules
or excluding documents. Code of Conduct, contribution, and security policy
wording is unchanged apart from whitespace; paragraph and list continuations
now meet the existing line-length limit. Missing final newlines, trailing
whitespace, and compact table spacing are corrected.

The historical integration guide retains its exploratory wording and
claims, not new compatibility certification. Three escaped example blocks
are enclosed in `text` fences so original sample lines remain intact rather
than wrapping inside strings. Each example block was compared with the
committed original: all non-trailing-whitespace content is unchanged. Prose
is wrapped and blockquote/list continuations remain explicit. The README
continues to identify this guide as historical input, not current guidance.

`bun run lint:docs` passes: Markdown reports zero issues, and spelling checks
14 documents with zero issues. `bun run check` also passes with the existing
156 tests and 1293 assertions. No application code, validation configuration,
dependency, or Forge authorization changed. Live verification remains blocked.

## Configured lint ticket 02 — 2026-10-19

`fence-rider lint [Forge options]` uses one full active-profile export, local
value delivery, stale optional cleanup, and the shared optional manifest check.
It injects no targeting flags and performs exactly one lint without runtime
writes or other Forge commands. Numeric lint statuses are preserved. Help is
configuration-free. The [consumer script](../how-to/how-to.md#run-configured-lint)
and [output contract](reference.md#output-and-input-policy) document prerequisites
and the deliberate passthrough boundary.

Red-before-green slices established configured lint delegation/output,
manifest consistency, and side-effect-free discovery. Public CLI regressions
then exercise whole-profile requiredness, manifest omission, special argument
boundaries, private schema/export failures, launch and child-signal failures,
statuses 2/23/127/255, live output before input, ordinary settings/authentication,
and POSIX interruption with ignoring helpers/descendants. A synthetic marker
printed by the delegated child is intentionally visible: Forge output and
input are not redacted. Private helper markers and deployment output remain
suppressed; no global confidentiality assertion was weakened.

Native SecretSpec 0.21.1 dotenv checks cover missing runtime and manifest
requirements despite ambient scope, explicit file/profile with native in-file
inheritance, shared manifest values, absent optional cleanup, and controls-only
profiles. Installed Forge CLI 14.2.0 version/help were inspected through Bun
1.4.3 without an app command; its Node.js 22.x/24.x support warning is recorded.
This establishes the lint interface only, not real manifest substitution,
Forge runtime compatibility, live lint, or remote acceptance.

Validation: 201 tests / 1618 assertions, zero failures, up from the fresh
173-test / 1426-assertion baseline. All native checks ran. `bun run check`,
`bun run lint:docs`, `bun run build`, compiled help/version, and
`git diff --check` pass. Static checks retain existing thresholds with no
suppression or disabled category. Shared manifest checking, signal setup, and
an explicit user-facing stdio mode reuse the deployment execution boundary.
No dependency, inventory, resolver, provisioning, general runner, later
workflow, live app contact, or remote mutation was added. Live verification
remains blocked pending separate named authorization.

## Configured deployment ticket 01 — 2026-10-19

`FORGE_ENVIRONMENT` is canonical for deployment; `FORGE_ENV` remains a legacy
alias. Either alone and matching dual values work. Conflicting resolved values
fail before Forge, including with an explicit target option. Both environment
names, site, and product are protected against runtime selection. Migration
and whole-profile requiredness are recorded in the
[deployment reference](deployment.md#environment-name-migration--2026-10-19)
and [variable contract](reference.md#profiles-and-forge-targets).

Red-before-green public CLI checks established canonical selection, alias
conflict rejection, canonical upload protection, and side-effect-free help.
Native SecretSpec 0.21.1 dotenv checks cover controls-only profiles, both names,
matching/conflicting defaults, overrides, optional stale-value removal,
required controls despite explicit target overrides, and shared local,
manifest, and runtime values from one full export. Existing regression checks
retain option forwarding, single-file limits, in-file profiles, manifest
checking, fail-fast ordering, numeric statuses, and process-group cleanup.

The existing configuration and private subprocess implementation is reused
through `src/configured.ts`; tests still invoke only the compiled public CLI.
No second resolver, provider SDK, inventory, dependency, or command framework
was introduced. Later workflows and package provisioning remain unimplemented.

Validation: 173 tests pass with 1426 assertions, up from 156 and 1293. The
forced `bun run check` gate, Biome lint/formatting, typecheck, Fallow, compiled
build, documentation lint/spelling, and `git diff --check` pass. The alias
check uses a native distinct-value set; no thresholds or suppressions changed.
Bun 1.4.3 and SecretSpec 0.21.1 were observed locally. Forge CLI 14.2.0 evidence
remains the previously inspected interface, not a new live check. No real
Forge app, secret provider credentials, remote write, or deployment was used.
