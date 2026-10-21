# Workflow validation record

Recorded 2026-10-19. Public seams: the compiled CLI subprocess
and observable validation-command output/status, confirmed by the user.
No private-function tests or second native proof suite were introduced.

## Script generators for lint, install and uninstall — 2026-10-21

`fence-rider lint`, `install` and `uninstall` no longer run Forge: each prints one
shell script on stdout, `exec secretspec run --scope '' -- …`, for a package
script to run ([ADR 0006](../adr/0006-generate-shell-for-lint-install-uninstall.md)).
Arguments given to the generator are shell-quoted into the script and
arguments appended by a script runner arrive as `"$@"`. Refusals print the
reason on stderr, nothing on stdout, and exit 1, so the documented guarded form
stops; an unguarded `eval` of an empty string exits 0, which is why the guard is
documented. Fence Rider no longer supervises these commands, so their
interruption tests were removed and exit status and signals belong to
`secretspec run` and Forge. Lint's manifest-scope check moved to
`fence-rider doctor`, which runs the value-free
`secretspec check --json --scope manifest` when the file declares that scope.
Deploy and tunnel are unchanged. Observed with a stub Forge and the real
SecretSpec 0.21.1: the generated scripts run, appended arguments reach Forge
intact, and a refusal stops the guarded form with exit 1.

## Lint under `secretspec run` — 2026-10-21

`fence-rider lint` now applies the optional manifest scope check and then runs
`secretspec run --scope "" -- forge lint`, so SecretSpec resolves the whole
profile into Forge's environment
([ADR 0005](../adr/0005-install-and-lint-delegate-to-secretspec-run.md)). It
makes one scope `check` and one `run`, with no `schema` or `export` call. Like
install and uninstall it does not validate resolved values or clear stale
ambient values, and an exported variable the profile does not resolve stays
visible to Forge. A missing required value fails inside `run` with SecretSpec's
error before Forge starts; a missing required value in the `manifest` scope is
reported by the preceding scope check. Observed against SecretSpec 0.21.1 with a
stub Forge: resolved values and the forwarded arguments reach Forge, and a
manifest declaration missing for a scope member stops the run before Forge.

## Install and uninstall under `secretspec run` — 2026-10-21

`fence-rider install` and `uninstall` now run Forge through
`secretspec run --scope "" -- sh -c SCRIPT`, so SecretSpec resolves the whole
profile and a fixed script derives the three targets
([ADR 0005](../adr/0005-install-and-lint-delegate-to-secretspec-run.md)).
They make no `schema`, `export` or scope `check` call, do not clear stale
ambient values for unresolved optional declarations, and do not validate
resolved values. Observed against SecretSpec 0.21.1: `run` lets resolved values
override ambient ones, leaves an undeclared exported variable in place, and
`--scope ""` ignores an ambient `SECRETSPEC_SCOPE`. Earlier entries below
record the previous TypeScript-built environment.

## Configured consumer acceptance — 2026-10-20

Consumer acceptance integrates the installed package from dependency delivery,
not the older deployment-only workflow. Three incremental native installed
checks execute the checked-in `docs/examples` configuration/scripts: deploy with
explicit approval, a distinct approval-token variant, install, upgrade, uninstall,
lint and tunnel; controls-only configuration verifies fallback/overrides
and whole-profile requiredness without dummy secrets.
All run real SecretSpec through the local packed artifact with controlled Forge.
The [CW-01–CW-22 map](consumer-workflows.md) records exact evidence boundaries.

The second approval token is an explicit replacement placeholder; only forwarding
is verified. `MAJOR_VERSION_RULE` is the upstream documented rule. Actual server
acceptance of a different rule requires a reported rule and authorized app check.
No authorization for a named disposable app/site/environment or exact operations
was supplied, so manifest substitution, encrypted storage/activation, real
installation/upgrade, connected tunnel receipt, uninstall and cleanup remain
**blocked**. Prior deployment live blockers are preserved. Direct anonymous
GitHub setup (since removed) and unexercised platforms retain the dependency
delivery limitations.

Validation resumed with explicit user permission after the temporary shell
blocker. Fresh full suite: **405 pass / 2866 assertions / zero failures**, with
native assets enabled. All three installed consumer tests pass (45 assertions).
Build, types, repository lint/format/Fallow and Markdown/spelling checks pass.
Earlier gate failures from two new test type errors and spelling were corrected
without suppressions or threshold changes. Local Markdown paths, references and
heading anchors pass across README, development guidance and docs (12 files);
external URL availability is not certified. The final native-enabled forced
`bun run check` passes (test and lint; size/pack hooks are no-ops because those
scripts are absent). Real local tarball installation is exercised by the tests.
Live claims above remain blocked.

## Dependency delivery — 2026-10-21 (supersedes the entry below)

The package no longer provisions SecretSpec: `fence-rider setup`, the pinned
installer digest, the mirror variables, and the package-local `.tools`
directory were removed in favor of `secretspec` on `PATH`
([ADR 0001](../adr/0001-secretspec-cli-on-path.md)). Workflows do not
pre-check versions; the `doctor` command reports SecretSpec and Forge versions
against their supported and tested range. Public tests cover `doctor` statuses
and exit codes and a missing executable failing before Forge runs.
Installed-consumer checks against the native executable
skip when SecretSpec is absent. The entry below records the superseded
provisioning evidence.

## Dependency delivery — 2026-10-20

Added the installed Bun executable, package allowlist/platform metadata, and
explicit verified SecretSpec setup. Red–green public tests cover absent bin
entrypoint, missing setup despite ambient tools, installer checksum rejection,
incompatible delivered version, and setup interruption cleanup. Real upstream
installer/native dotenv resolution passed in an isolated installed consumer with
no global SecretSpec selection. Existing subprocess fixtures are reused.

Provisioning evidence is macOS arm64, Bun 1.4.3, SecretSpec 0.21.1. Fresh release
assets were obtained through authenticated GitHub API and verified, then served
over loopback to the official installer. Anonymous direct GitHub setup returned
HTTP 422; this is a network-path blocker, not fresh direct-endpoint success.
Other platform execution remains unverified. No new npm dependency or lockfile,
registry publication, live Forge operation, provider login, or app registration
was needed. See [delivery limits](installation.md).

Validation: 402 tests / 2821 assertions, zero failures with native assets enabled;
without assets the native installed test explicitly skips. Build, types, lint
(including Fallow), Markdown/spelling, and whitespace checks pass. A broader
`biome check` additionally reports pre-existing import ordering in `src/install.ts`
and `src/lint.ts`; the repository's lint/format gates pass unchanged.

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

All named checks below are in [the public suite](../../tests/).
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
| AC-11 | `invalid or duplicate target %j fails before any tool call`; target-like payload cases after the terminator |
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
run or live app contacted during this validation. No app ID, environment, permitted
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

| Command | Result |
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

A clean Git working tree is separate from a green validation gate. This
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

## Configured lint — 2026-10-19

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

## Configured installation — 2026-10-19

Implemented at the approved compiled public CLI seam. Red-before-green slices
established one configured install, independent overrides, payload/terminator
preservation, invalid/duplicate/missing targets, and side-effect-free help.
Final parser edge checks reject short-equals and attached demo-site bypasses.
No tests call private helpers. No dependency, parser framework, threshold
change, suppression, or later workflow implementation was introduced.

The target and argument contract is in [the reference](reference.md#configured-installation).
Native checks use SecretSpec 0.21.1 and synthetic dotenv values, not provider
credentials or a live Forge app.

Public checks establish unchanged explicit upgrade/consent/non-interactive
policy, target-like required option payloads, optional/variadic arguments,
no uploads/deployment/deletion, and omission of the manifest cross-check.
Live pipe output before input, inherited settings/authentication, visible
synthetic echoed values, numeric statuses 2/23/127/255, helper/launch/signal
failures, and bounded POSIX ignoring-child/descendant cleanup are covered.
The existing lint failure policy is shared without changing confidentiality.

Interface evidence: installed Forge CLI 14.2.0 `install --help`, published
14.2.0 installation registration/context parsing, and shared 9.8.0
supported-products source. Verified products are Jira, Confluence, Compass,
and Bitbucket; the latter uses a workspace URL. Feature-gated Teamwork Graph
and demo-site targeting are not supported by this slice. Upgrade has an
optional `all`/`code` target. Required override/version/unit options consume
switch-looking payloads. Bun 1.4.3 inspection emitted the existing Forge
Node.js 22.x/24.x support warning. This proves neither runtime compatibility
nor server acceptance. See [the full contract](reference.md#configured-installation).

Validation: 262 tests / 1954 assertions, zero failures, up from 201 / 1618.
All installed native checks ran. `bun run check`, `bun run lint`,
`bun run lint:docs`, `bun run build`, compiled install help/version, and
`git diff --check` pass with unchanged gates. Initial native fixture errors
(required descriptions), documentation wrapping/spelling, and parser health
findings were corrected; temporary downloaded inspection files and compiler
intermediates were removed rather than committed.

No live install, upgrade, consent, deployment, registration, or cleanup was
authorized or performed. Real terminal prompts, Windows process-tree cleanup,
and live site acceptance remain separately blocked evidence, not passing
checks. Short install/upgrade scripts and explicit authorization warnings are
in [the consumer guide](../how-to/how-to.md#install-or-upgrade-the-configured-app).
Uninstall, tunnel, dependency delivery, and final consumer acceptance remain
separate work. Existing user specification edits are excluded from this
implementation commit.

## Configured uninstall — 2026-10-19

Implemented at the approved compiled public CLI seam. Red-before-green slices
established configured delegation, uninstall-specific required-value grammar,
configuration-free discovery, and numeric failure diagnostics. The existing
installation module shares targets, configuration, execution, and interruption;
no second resolver, dependency, command framework, or validation exemption
was introduced.

The target contract is in [the reference](reference.md#configured-uninstall).
Native checks use SecretSpec 0.21.1 with synthetic dotenv values.

Public CLI checks cover target forms, invalid/duplicate/missing targets,
installation-ID/app-override payloads, terminators, preserved caller arguments,
no inherited install policy, live output before input, ordinary settings and
authentication, numeric statuses 2/23/127/255, private helper/launch/child-signal
failures, and bounded POSIX SIGINT/SIGTERM cleanup of ignoring descendants.
Forge streams and echoed synthetic input intentionally remain without redaction.

Interface evidence: installed Forge CLI 14.2.0 `uninstall --help`, published
14.2.0 registration, command options and uninstall helper source, plus the
previously inspected shared 9.8.0 product handling. Uninstall supports context
and environment targets, batch, installation ID, and app override. It does not
register installation's `--non-interactive`, upgrade, or consent switches.
Required ID/override values consume switch-looking payloads. A matching native
target can uninstall directly, including associated installation contexts;
input inheritance does not imply a confirmation prompt. Bun 1.4.3 inspection
emitted Forge's Node.js 22.x/24.x warning. This is interface evidence, not live
runtime certification. See [the contract](reference.md#configured-uninstall).

Validation: 320 tests / 2306 assertions, zero failures, up from the fresh
262-test / 1954-assertion baseline. All native checks ran. The focused
install/uninstall suite passes 120 tests / 718 assertions. `bun run check`,
`bun run lint`, `bun run lint:docs`, `bun run build`, compiled uninstall
help/alias/version, and `git diff --check` pass. Parser health findings were
resolved without changing thresholds, suppression, or analysis categories.
The read-only review found no correctness regressions. Inspection downloads
and compiler intermediates are removed, not committed.

The [short script and authorization boundary][uninstall-guide] explicitly warn
that uninstall changes remote installation state. No live uninstall, app/site
contact, registration, upload, deployment, or cleanup was authorized or run.
Real terminal-specific prompts and Windows process-tree behavior remain
unverified. Tunnel, dependency delivery, and final consumer acceptance remain
separate work. Existing user specification edits are excluded from the
implementation commit.

[uninstall-guide]: ../how-to/how-to.md#uninstall-the-configured-app

## Configured tunnel — 2026-10-20

Implemented `fence-rider tunnel` at the approved compiled public CLI seam.
Red-before-green slices cover explicit runtime prefix mapping/stale cleanup,
unsupported target rejection, target/debug grammar, protected controls,
reserved-prefix declaration collisions, configuration-free help, and required
URL payload handling. `src/tunnel.ts` reuses shared configuration, optional
manifest checks, live stdio, failure statuses, and bounded process cleanup.
No resolver, dependency, provider SDK, declaration inventory, exemption, or
new private test API was added; health thresholds remain unchanged.

Native checks use one SecretSpec 0.21.1 synthetic dotenv export; the mapping
contract is in [the reference](reference.md#configured-tunnel). Twelve native
cases cover controls-only profiles, aliases, required values despite explicit
targets, fallback, absent/empty runtime values, file/profile/provider selection,
in-file inheritance, manifest checking, and stale prefix removal. Controlled
Forge children observe the environment passed by the compiled wrapper, not a
connected function runtime. They prove no variable upload/deletion, deployment,
installation, or extra Forge operation.

Interface evidence: installed Forge CLI 14.2.0 `tunnel --help`, exact published
14.2.0 registration/controller/environment sources, shared 9.8.0 environment
mapping, tunnel 7.3.0 local invocation server and sandbox, and runtime 7.0.1
`getUserVars`. The runtime helper strips `FORGE_USER_VAR_`, retaining empty
strings. Official documentation supports named development environments,
not staging/production tunnels. The wrapper rejects reserved staging/production
before Forge and does not pretend syntax validation proves that a named target
exists or is authorized. Forge's `-h` is debug host, not help. Required,
optional, attached, grouped, switch-looking, and post-terminator payloads retain
the inspected argument contract. Bun 1.4.3 interface inspection emitted Forge's
Node.js 22.x/24.x support warning; it does not certify a Forge runtime under Bun.

Validation: `bun run check` passes lint, test, size, and pack gates. A separate
full run passes **396 tests / 2782 assertions**, zero failures, up from the fresh
320-test / 2306-assertion baseline. All native checks ran. Focused tunnel/help
regressions pass 142 tests / 1029 assertions. Numeric tunnel statuses, private
helper/launch/child-signal failures, inherited input, pre-exit output, optional
manifest failure ordering, and bounded SIGINT/SIGTERM cleanup of ignoring
process descendants are covered. No real-terminal or Windows tree claim is
made. One earlier full gate hit an anomalous existing lint-test timeout after
a long execution pause; the complete gate and separate full suite both passed
on repeat without weakening timeouts or checks. `bun run lint`,
`bun run lint:docs`, `bun run build`, compiled tunnel help/alias/version,
and `git diff --check` pass after removing temporary inspection downloads.

The [procedure][tunnel-guide] supplies prerequisites and a short app script; the
[contract](reference.md#configured-tunnel) specifies destination-specific
empty-string support, reserved-prefix collision handling, and live Forge/app
logs without redaction. Inspection archives are removed, not committed. Durable
evidence is recorded here. Existing user specification edits remain excluded
from the implementation commit.

**Connected runtime receipt: blocked pending separate authorization.** No live
tunnel, app/site invocation, registration, remote-variable mutation, deployment,
installation, or live cleanup was authorized or run. An authorized disposable
development app and approved boolean-only observation of explicit runtime
members (and absence of an unselected member) are still needed. Ordinary child
environment observation is not reported as connected runtime delivery.
Dependency provisioning and packed consumer acceptance remain separate work.

[tunnel-guide]: ../how-to/how-to.md#tunnel-with-configured-local-runtime-values

## Environment control simplified — 2026-10-21

The `FORGE_ENV` legacy alias and its conflict check were removed;
`FORGE_ENVIRONMENT` is the only environment control, and `FORGE_ENV` is an
ordinary application variable. The 2026-10-19 entry below records the earlier
alias behavior.

## Configured deployment — 2026-10-19

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

## Scope membership delegated to SecretSpec — 2026-10-21

Fence Rider no longer reads `secretspec.toml` or passes `--file`/`--profile`.
It resolves the whole profile once (`schema`, `export --scope ""`), then asks
SecretSpec for scope members by name with `check --json --scope manifest` and
`--scope runtime`, only where a workflow uses them. `project.extends` is no
longer rejected, scope metadata is no longer validated by the wrapper, and
`manifest.yml` is read only when the manifest scope has members. A scope the
file does not define has no members, recognized from SecretSpec's
"is not defined in secretspec.toml" error text. `doctor` keeps an advisory read
of `SECRETSPEC_FILE` or `./secretspec.toml` for unused scope names; an
unparsable file only skips that check with a warning. See
[ADR 0002](../adr/0002-delegate-scope-membership-to-secretspec.md).

A run now makes up to three SecretSpec resolutions; values still come only from
the whole-profile export. The earlier entries describing `extends` rejection,
single-file limits, and one-resolution claims record superseded behavior.
Native checks against SecretSpec 0.21.1 with synthetic dotenv values observed
the scoped report and the undefined-scope error.

## Install targets from the profile only — 2026-10-21

`fence-rider install` and `fence-rider uninstall` no longer accept the
wrapper-owned `-e`/`--environment`, `-s`/`--site` and `-p`/`--product` options.
They are recognized only to be refused, before SecretSpec or Forge is called.
Targets come from the resolved `FORGE_ENVIRONMENT` (else `development`),
`FORGE_SITE` and `FORGE_PRODUCT`, each nonempty and not starting with `-`, and
Forge is invoked as `forge <command> --environment E --site S --product P`
followed by the forwarded arguments. Someone needing explicit control runs
`secretspec` and `forge` directly; `secretspec run` does not clear stale ambient
values for unresolved optional declarations, unlike Fence Rider. See
[ADR 0004](../adr/0004-install-targets-from-profile-only.md). Earlier entries
describing independent target overrides record superseded behavior. This change
was documented only; the test and source updates are recorded elsewhere.
