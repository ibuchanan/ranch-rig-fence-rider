# Configured consumer workflow acceptance

Recorded 2026-10-20 for configured consumer acceptance. The [whole-concept planning spec][plan]
defines CW-01–CW-22; the [implemented contract][contract] defines current behavior.
The original deployment AC-01–AC-18 record remains in [validation](validation.md).

## Evidence boundaries

- **Controlled:** the real wrapper with recording/failing Forge executables.
  Observable arguments, child environment, output, input, status, write ordering,
  and process cleanup; no service contact.
- **Native:** real SecretSpec 0.21.1 schema/export with synthetic dotenv/defaults
  and same-file profile inheritance. Installed checks run the actual native
  executable found on `PATH`, not a fake.
- **Interface:** Forge CLI 14.2.0 help, published source, and documentation.
  Interface inspection is not a passing server or runtime integration check.
- **Live:** separately authorized Forge app/service observations. **Blocked** for
  every claim below; no destination or exact operations/cleanup authorized.

All tests live at the approved CLI/installed-consumer process seams in
[the CLI test files in `tests/`][tests]. No private helper tests or duplicate
proof harness.
Exact test names below are searchable. Installed examples run under Bun 1.4.3
on macOS arm64, with Forge controlled. Supported package platforms/runtime and
fresh-download versus mirrored/cached evidence are in [tool delivery][delivery].
Forge's actual supported Node.js runtime remains separate from this Bun wrapper;
running its help with Bun emits an unsupported-runtime warning and does not
certify real Forge execution under Bun.

## CW acceptance map

| ID | Observable local evidence | Service/other evidence still missing |
| --- | --- | --- |
| CW-01 | Installed package discovery; documented installed consumer scripts run via Bun package scripts | Registry publication is not attempted or required |
| CW-02 | Installed consumer runs native lint against SecretSpec on `PATH`; missing-tool diagnostics before Forge runs; `doctor` version report | Floors are inferred, not exercised; other platform execution unverified |
| CW-03 | Required values fail before Forge in compiled native cases and installed controls-only uninstall | Other providers unverified |
| CW-04 | Deployment shared-values test sees unchanged implicit local values and removes stale absent optional; compiled tests cover empty strings | Broader native providers unverified |
| CW-05 | Shared value matches local upload args and tunnel prefix mapping from one export; native profile tests count one schema/export | Actual manifest substitution and connected runtime receipt blocked |
| CW-06 | Environment control selection in native compiled tests and installed controls-only cases | Named server environment identity blocked |
| CW-07 | Installed controls-only install overrides all targets independently; compiled deploy upload/deploy target checks | Actual server destination blocked |
| CW-08 | Command grammar tests reject duplicates/missing targets and preserve unrelated options | Upstream version range unverified |
| CW-09 | Installed lint script gets all inputs and live output; only one lint call with no injected target or writes | Real Forge manifest acceptance blocked |
| CW-10 | Installed install/upgrade preserve explicit consent/non-interactive switches and configured targets | Real install/upgrade/scope consent blocked |
| CW-11 | Installed uninstall injects only targets; no runtime sync or inherited install policy | Actual removal and terminal-specific prompts blocked |
| CW-12 | Installed tunnel gets explicit runtime values through prefixed env and no variable writes; compiled restrictions/debug/interruption tests | Connected local runtime receipt and named environment identity blocked |
| CW-13 | Installed deploy scripts encrypt two selected values before one matching-target deployment | Encrypted remote storage and deployment activation blocked |
| CW-14 | Native controls-only deploy/tunnel/install run without runtime scope or dummy secret; no deletion command | Live controls-only workflow blocked |
| CW-15 | Compiled deploy/tunnel tests reject each environment/site/product control in runtime scope before writes | No extra service evidence needed for rejection |
| CW-16 | Native/controlled manifest mismatch and optional omission tests; installed shared manifest inputs arrive locally | Forge substitution into supported real manifest fields blocked |
| CW-17 | Existing special-value, option payload and no-shell-injection tests; installed approval/verbose preservation | Remote acceptance of positional edge-case values unverified |
| CW-18 | Existing inherited-input/streaming tests for all user-facing workflows; installed scripts preserve results/warnings; private helper secrecy tests | Terminal UI specifics unverified; user output is intentionally not redacted |
| CW-19 | Existing SIGINT/SIGTERM process-tree/failure tests; delegated exit preservation | Windows unsupported; SIGKILL cannot clean up; live tunnel interruption blocked |
| CW-20 | Controlled partial upload failure stops later writes/deploy and warns without values or rollback claim | Actual partial server mutation blocked |
| CW-21 | Installed help/version/unsupported commands need neither config nor tools; compiled discovery tests | No service evidence needed for discovery |
| CW-22 | All seven documented scripts run through installed artifact with real SecretSpec and controlled Forge; controls-only variant passes | End-to-end live compatibility/readiness remains blocked, not certified |

## Installed script checks

The two tests named `documented installed consumer ...` execute the
[checked-in script example](../examples/package.json), declarations, manifest
fragment, and synthetic provider values. They cover both deployment approval
variants, install, upgrade, caller-controlled uninstall, lint, and tunnel.
`MAJOR_VERSION_RULE` is documented upstream; the alternate
`REVIEWED_RULE_FROM_FORGE` is an explicit replacement placeholder, not a verified
server rule. Only distinct-rule argument forwarding is established for it.
`installed controls-only consumer ...` covers environment fallback, explicit
site/product/environment overrides and whole-profile requiredness without
runtime scope or dummy credential.

These are incremental acceptance checks on completed behavior slices. The script
fixture was missing on the first failing run, then supplied and executed. No new
Forge behavior or invented private API was needed. Native installed tests skip
explicitly without SecretSpec on `PATH`; a skipped run is not native evidence.

## Safety, lifecycle, and support

SecretSpec owns declarations, defaults, provider auth and same-file profile
inheritance. Fence Rider resolves the full active profile once, removes stale
ambient declarations, and delivers all resolved values locally. Optional manifest
scope only cross-checks applicable native manifest declarations. Explicit runtime
scope authorizes deployment uploads or tunnel-local injection, not synchronization
on lint/install/uninstall. A shared value reuses the same export result.

Deployment validates all selected values before encrypted writes; the following
deployment activates them under documented Forge lifecycle. Failed writes can
leave partial updates. There is no automatic rollback, deletion, undeclared
upload, install, or consent. Only a single TOML specification is supported;
nonempty/malformed `project.extends` is rejected. Native dotenv/defaults/profile
checks do not certify other providers or SDK features.

Private resolution and upload output is suppressed, not a universal redaction
system. Lint/install/uninstall/tunnel inherit streams without redaction and
caller input; child code may print any value. All resolved app values reach local
Forge children; ambient authentication and unrelated environment are retained
intentionally.
Process inspection may expose arguments and environments, especially positional
upload values. Keep logs and providers private. POSIX cleanup uses bounded
process-group termination; no universal cleanup or terminal compatibility promise.

## Live evidence blockers

Authorization must name a disposable registered app, site, environment, exact
synthetic variable, deployment/install/upgrade/tunnel/uninstall operations,
allowed observations, and cleanup. No such authorization was supplied. Therefore:

- Real manifest substitution: **blocked**, missing approved app/field observation.
- Encrypted storage/activation: **blocked**, missing permitted synthetic write,
  target metadata observation, deployment, and boolean-only runtime comparison.
- Installation/upgrade targeting: **blocked**, missing permitted site/product
  mutation, consent, and installation observation.
- Connected tunnel receipt: **blocked**, missing authorized redirection and a
  boolean-only local runtime observation on an invoked installed app.
- Uninstall/cleanup: **blocked**, missing expressly permitted disposable removal
  and cleanup scope. Never substitute an existing production installation.

The original deployment live blocker is preserved. Local completion is not a
release-readiness or live-compatibility pass. Use the [workflow how-to][guide]
for procedures and the [validation log](validation.md) for command outcomes.

[plan]: ../../specs/configured-forge-workflows-spec.md
[contract]: reference.md
[tests]: ../../tests/
[delivery]: installation.md
[guide]: ../how-to/consumer-workflows.md
