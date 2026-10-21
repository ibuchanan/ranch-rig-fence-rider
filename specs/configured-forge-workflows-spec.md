# Fence Rider: configured Forge workflows

Status: approved planning baseline, 2026-10-19; not implemented or certified.
This specification captures the whole product concept, not only an extension
of encrypted uploads. It supersedes the deployment-only product boundary of
the [original specification](fence-rider-spec.md), while retaining its proven
routing and deployment safeguards unless a change is explicit below.

The existing [variable contract](../docs/reference/reference.md) and
[validation record](../docs/reference/validation.md) describe the implemented
baseline. Their deployment evidence does not prove these new workflows.

## Problem Statement

Forge developers need three kinds of configuration: local values for tooling,
manifest inputs for Forge substitution, and runtime variables uploaded to a
Forge environment. These categories describe consumers and delivery, not
whether a value is confidential. One value may serve multiple consumers.

Declaring requirements alone does not deliver values to those consumers.
Developers still maintain shell helpers, repeat variable expansion in package
scripts, supply site/product/environment options manually, and synchronize
runtime variables separately. Forks inherit instructions and fragile plumbing
rather than one reusable development workflow. Missing configuration fails
late, and targeting mistakes can send runtime values and deployment to
different environments.

The current deployment workflow addresses runtime synchronization and local
availability during deployment. It does not yet provide the standard wrapper
for installation, upgrade, uninstall, lint, and tunneling. A separately
installed global SecretSpec executable also falls short of the intended
consumer experience: a development dependency should supply the integration,
not require every repository to reconstruct it.

## Solution

Fence Rider is the repository's standard, development-time Forge command
wrapper. A maintainer declares configuration once through SecretSpec and uses
short package scripts that call Fence Rider with ordinary Forge arguments.
There is no repository-specific shell helper or repeated expansion of target
variables. The wrapper supplies resolved local and manifest inputs, translates
configured Forge controls into supported target options, and uploads only
explicit runtime members when deployment requires it.

SecretSpec remains the authority for declarations, defaults, profiles,
providers, authentication, and resolution. Fence Rider uses native SecretSpec
capabilities wherever they satisfy the contract and adds only the Forge-aware
execution, target mapping, routing, and synchronization behavior. It does not
become a replacement secret manager or a general shell executor.

Repository scripts retain visible workflow policy: approvals, installation
upgrade, and non-interactive operation are explicit arguments. The wrapper
never infers consent or adds deployment, installation, or synchronization as a
side effect of an unrelated command.

A development dependency provides the Fence Rider entry point and a supported
way to obtain its compatible SecretSpec executable. Consumers do not need a
global SecretSpec installation or a per-repository bootstrap script. Forge
itself remains a separately available, authenticated prerequisite. Provider
credentials and app registration are never supplied automatically.

## User Stories

1. As a maintainer, I want local, manifest, and runtime requirements declared
   once through SecretSpec, so that forks inherit one configuration contract.
2. As a developer, I want resolved values delivered to the correct consumers,
   so that I do not manually copy or export them for each workflow.
3. As a maintainer, I want one reusable development dependency, so that I do
   not maintain a Bash helper in every repository.
4. As a contributor, I want that dependency to supply the SecretSpec
   integration, so that I do not need a matching global installation.
5. As a maintainer, I want short, readable package scripts, so that command
   intent is visible without environment-variable plumbing.
6. As a developer, I want ordinary Forge arguments accepted by the wrapper,
   so that I do not learn a second command language.
7. As a team maintainer, I want my chosen SecretSpec provider to resolve
   configuration, so that Fence Rider does not tie the team to one vault.
8. As a downstream contributor, I want a supported local provider, so that
   I can work without access to the maintainer's vault.
9. As a developer, I want native SecretSpec defaults and profile behavior,
   so that the wrapper does not introduce a competing configuration format.
10. As a developer, I want unscoped declarations available locally, so that
    local tooling needs no redundant variable inventory.
11. As a developer, I want required values validated before Forge execution,
    so that missing configuration fails at the workflow boundary.
12. As a maintainer, I want whole-profile validation to remain explicit, so
    that command execution does not silently weaken requiredness.
13. As a developer, I want manifest inputs supplied to Forge, so that
    substitution works without pre-exporting variables in my shell.
14. As a maintainer, I want the optional manifest declaration check retained,
    so that declared consistency requirements fail before deployment writes.
15. As a developer, I want one resolved value reused across destinations,
    so that a rotating provider cannot make uploads and local use diverge.
16. As a developer, I want runtime uploads explicitly selected, so that
    local controls and unrelated credentials remain local.
17. As a maintainer, I want runtime selection in SecretSpec, so that I do not
    maintain a second variable-keys file.
18. As a release operator, I want runtime values uploaded encrypted before
    deployment, so that synchronization remains safe and predictable.
19. As a developer, I want controls-only projects to work, so that an app
    without runtime variables needs no dummy upload declaration.
20. As a developer, I want configured environment, site, and product defaults,
    so that routine commands do not repeat targeting information.
21. As an operator, I want explicit target options to override defaults,
    so that a one-off invocation can select its intended destination.
22. As an existing user, I want a safe transition from the old environment
    control name, so that an upgrade cannot silently change my target.
23. As an operator, I want ambiguous targeting rejected, so that duplicate
    options or conflicting control names cannot select a surprising target.
24. As a developer, I want target options added only to compatible commands,
    so that deployment or lint does not receive installation-only switches.
25. As a developer, I want uploads and deployment to share one environment,
    so that runtime values never target a different deployment destination.
26. As an app installer, I want installation and upgrade through the wrapper,
    so that configured targets apply without shell expansion.
27. As an operator, I want uninstall through the same wrapper, so that it
    uses the same defaults without becoming implicitly non-interactive.
28. As a developer, I want configured lint through the wrapper, so that
    manifest inputs are available during validation as well as deployment.
29. As a developer, I want local tunnel runtime values delivered through
    Forge's supported mechanism, so that exporting variables is not mistaken
    for actual tunnel configuration.
30. As an operator, I want non-deployment workflows to avoid synchronization,
    so that lint, installation, uninstall, and tunnel do not mutate remote
    variables behind my back.
31. As a maintainer, I want approval and interaction switches left explicit,
    so that repository policy remains visible in package scripts.
32. As a developer, I want usable command output and interactive input,
    so that wrapping Forge does not turn uninstall or tunnel into a blind
    or unusable subprocess.
33. As a security-conscious maintainer, I want private resolver and upload
    output suppressed and wrapper diagnostics value-free, so that the wrapper
    does not expose credentials through orchestration messages.
34. As a developer, I want values passed without shell interpretation,
    so that quotes, newlines, spaces, and shell syntax remain data.
35. As a CI maintainer, I want command failures and interruption propagated,
    so that pipelines stop and delegated processes are cleaned up.
36. As an operator, I want partial upload failures reported honestly, so that
    I know remote changes may already have occurred.
37. As a developer, I want help and version discovery without configuration
    or tool downloads, so that exploring the CLI has no secret or remote
    side effects.
38. As a contributor, I want reproducible consumer-level checks, so that a
    successful source checkout is not confused with a working dependency.
39. As a maintainer, I want supported versions and limits recorded honestly,
    so that simulated tests are not presented as live Forge certification.

## Implementation Decisions

### Product boundary and ownership

- The supported command surface for this iteration is deployment, lint,
  installation including upgrade, uninstall, and tunnel. Each becomes
  supported only with its own implementing acceptance checks. An upgrade is
  installation with an explicit upgrade option, not a separate Forge command.
- Fence Rider accepts command arguments directly and launches executables
  without shell evaluation. It is not a command-string interpreter or an
  arbitrary executable runner.
- A common execution boundary supplies configuration to all supported
  workflows. Deployment remains a specialized lifecycle, not the only reason
  to invoke the wrapper. Reuse working deployment behavior rather than
  replacing it with a parallel framework.
- Continue the existing TypeScript/Bun development tooling. Consumer runtime
  and platform support must be declared and exercised through installation
  checks; development tooling is not evidence of consumer prerequisites.
- SecretSpec owns configuration semantics and provider behavior. Use native
  execution, export, schema, or other supported facilities as appropriate.
  Do not require native execution for every path if that would duplicate
  resolution, conceal values needed for synchronization, or weaken safeguards.
- Exact upstream capability checks belong to the implementing slices, not a
  separate research/proof project. An incompatible upstream finding returns
  the affected contract for review; it does not authorize an invented API.

### Configuration and delivery

> **Superseded 2026-10-21:** Fence Rider no longer reads `secretspec.toml`,
> rejects `project.extends`, or passes `--file`/`--profile`. Scope membership is
> asked of SecretSpec with `check --json --scope`, and inheritance is
> SecretSpec's ([ADR 0002](../docs/adr/0002-delegate-scope-membership-to-secretspec.md)).
> The single-specification and cross-file rejection statements below, and the
> matching non-goal, are historical.

- Retain the single-specification boundary, native in-file profile
  inheritance, and rejection of unsupported cross-file inheritance. No
  provider SDK, alternate schema, custom profile merger, or second variable
  inventory is introduced.
- Retain full active-profile validation for every configured workflow in
  this iteration. Do not narrow resolution using an ambient scope. A
  required site can therefore block lint, and a required runtime credential
  can block uninstall; this is repository readiness, not command-scoped
  requiredness. Native optional declarations and profiles remain available.
- (Superseded 2026-10-21 for `install` and `uninstall`: the wrapper no longer
  accepts target options; targets come only from the resolved profile, and
  both commands now run under `secretspec run`, so they make no `schema`,
  `export` or scope call and do not clear stale ambient values. See
  `docs/adr/0004-install-targets-from-profile-only.md` and
  `docs/adr/0005-install-delegates-to-secretspec-run.md`.)
- Explicit target arguments override target selection, not SecretSpec
  requiredness. Missing required declarations still fail even if a command
  option could otherwise supply that target.
- Resolve one coherent value set per invocation. Metadata inspection must
  not trigger another provider resolution. Every destination for a shared
  variable uses that same set.
- All resolved application values are available in the Forge child
  environment. Unscoped local values are valid. Remove stale inherited
  values for declared but absent optionals; retain ordinary process settings
  and existing authentication. This is not credential isolation.
- Manifest scope membership adds a declaration consistency check, not an
  injection allowlist. Apply that check to deployment and manifest-consuming
  lint/tunnel workflows. Installation and uninstall do not acquire that
  additional check merely because they share the execution boundary. Forge
  still validates substitutions and its own manifest.
- Runtime scope membership is the only authority for automatic encrypted
  uploads. Missing runtime scope or empty effective membership means no
  uploads and no deletion. Native invalid empty declarations stay invalid.
- Controls-only projects are valid. Local/manifest/runtime describe delivery
  destinations, not confidentiality. Membership may overlap for app values;
  targeting controls cannot be selected as runtime values.

### Target names and precedence

> **Superseded 2026-10-21:** the `FORGE_ENV` legacy alias and its conflict
> check were removed. `FORGE_ENVIRONMENT` is the only environment control, and
> `FORGE_ENV` is an ordinary application variable. The alias bullets and
> scenarios below (CW-06, CW-15, the non-goal and planning-policy mentions) are
> historical.

- Make `FORGE_ENVIRONMENT` canonical alongside `FORGE_SITE` and
  `FORGE_PRODUCT`. Retain `FORGE_ENV` as a documented legacy alias during
  this iteration. Protect both environment names against runtime selection.
- Accept the legacy alias alone, the canonical name alone, or both when
  their resolved values agree. Conflicting resolved names fail before Forge
  execution, including when an explicit environment option is present. Do
  not silently choose a production-affecting migration precedence.
- For supported target options, precedence is explicit invocation value,
  then the resolved control, then an established fallback. Retain the
  development environment fallback where the verified command supports it.
  Product defaults belong to native declarations; do not silently add a
  second product default. Do not invent a site default.
- Apply environment/site/product options only to verified commands that
  accept them. Lint receives configuration, not automatically injected
  targeting flags. Tunnel environment restrictions follow the verified
  Forge interface, not an assumption of arbitrary environment support.
- Installation and uninstall need unambiguous site/product/environment
  targeting. Missing required effective targets fail rather than starting
  target-selection prompts. Other Forge interaction is preserved unless
  the caller explicitly requests non-interactive operation.
- Normalize consumed targets to one effective option each. Validate missing
  values and duplicates using the selected Forge version's option grammar.
  Preserve unrelated arguments, their boundaries, and order, including
  option values that resemble targeting flags and terminator payloads.
- A profile name is not a Forge environment. Do not derive one from the
  other. Deploy uploads and delegated deployment use the same effective
  environment even after an explicit override.

### Workflow lifecycle

| Workflow | Configured delivery | Automatic remote-variable writes |
| --- | --- | --- |
| Deploy | Full local environment, manifest inputs/check, effective environment | Explicit runtime members encrypted before deployment |
| Lint | Full local environment, manifest inputs/check; no injected target flags | None |
| Install / upgrade | Full local environment and supported site/product/environment defaults | None |
| Uninstall | Full local environment and supported target defaults; caller-controlled interaction | None |
| Tunnel | Full local environment, manifest inputs/check, verified local runtime delivery and environment constraints | None |

- Deployment validates configuration and every selected upload before the
  first write. All uploads succeed before exactly one deployment. Failure
  stops later operations, warns about possible partial writes, and performs
  no automatic rollback, retry, or remote deletion.
- Installation never deploys or synchronizes runtime variables. Upgrading
  an installation does not stand in for deployment activation of variables.
  Uninstall never inherits upgrade, approval, or non-interactive switches
  from installation defaults.
- Tunnel requires verification of Forge's local runtime-variable injection
  mechanism and selection rules using the explicit runtime membership and
  once-resolved values. Plain child-environment inheritance is not sufficient
  proof. Do not invent a prefix, assume production tunneling, or reuse remote
  upload orchestration. Unsupported environments fail before starting Forge.
- Approval rules and non-interactive switches remain explicit caller policy.
  Do not infer approval, scope consent, installation upgrade, or a second
  command from a target default or another successful operation.
- Help, version, no-command help, and rejected unsupported commands must not
  resolve secrets, download tools, or mutate remote state. Help may describe
  supported behavior without requiring a configured app.

### Dependency and executable delivery

- A normal development-dependency installation must provide the wrapper
  entry point and a compatible native SecretSpec execution path on explicitly
  supported platforms without a preinstalled global SecretSpec.
- Select the smallest upstream-supported provisioning/package mechanism and
  exercise it from an installed consumer. Do not assume a JavaScript SDK
  ships the native executable. Declare version, platform, integrity, network,
  install-script, and offline/cache limitations of the chosen mechanism.
- Executable selection must be deterministic and must not silently switch
  to an incompatible ambient global binary. If a delivery strategy needs
  explicit opt-in installation behavior, document and test it rather than
  adding a bespoke repository script.
- Provisioning belongs to an explicit installation/setup lifecycle, not a
  hidden first-run download. Unsupported platforms and missing executables
  fail actionably. Help and version never provision anything.
- Forge remains separately available and authenticated; no login, app
  registration, secret-provider authentication, or automatic Forge install
  is introduced. Package publication is not authorized by this plan; local
  packed-artifact installation is sufficient for delivery checks.

### Output, interaction, and safety

- Separate private orchestration subprocesses from the delegated user-facing
  command. Resolver/schema/export and encrypted-upload output remains private;
  wrapper progress and errors never print values or secret-bearing commands.
- Define and test a deliberate user-facing Forge output/interaction policy
  in the first non-deployment slice. Lint results must be useful; interactive
  prompts must accept input; tunnel output must be observable while running.
  Do not blindly apply deployment's ignored input and suppressed output.
- Preserve the existing deployment confidentiality tests unless an explicitly
  documented change is necessary. Do not promise that arbitrary Forge output,
  application logs, or terminal sessions can never expose a value merely
  because Fence Rider's own messages are safe. Any passthrough boundary or
  redaction limitation must be explicit before that workflow is supported.
- Never persist resolved values, generate secret files, or cache credentials.
  Native installation caches may store executables, not resolved app values.
  Positional upload values may remain visible to operating-system process
  inspection; do not claim otherwise.
- Preserve numeric delegated-command exit status. Launch, resolution,
  validation, signal, and interruption failures cannot become success.
  Long-running and interactive commands need bounded interruption cleanup
  consistent with the already tested process-group contract. Do not claim
  Windows process-tree support without evidence.

## Testing Decisions

### Confirmed public seams

The user confirmed the existing public CLI subprocess boundary: invoke the
real wrapper in isolated synthetic projects with controlled executables and
observe arguments, child environments, output, exit status, side-effect
ordering, and cleanup. Do not add private-helper exports or couple assertions
to a new internal module layout.

Add a consumer-level seam only for dependency delivery: install a packed local
artifact into an isolated project and invoke its package scripts without a
global SecretSpec. Use the installed artifact, not a source-checkout shortcut.
This checks the installation promise, not a new private implementation API.

Reuse native SecretSpec synthetic dotenv checks through the same public CLI.
The baseline is SecretSpec 0.21.1 and inspected Forge CLI 14.2.0; actual support
for each new behavior must be recorded as it is implemented. Controlled Forge
executables cannot certify manifest substitution, tunnel runtime delivery,
installation, encryption, or server-side activation.

### Acceptance scenarios

| ID | Scenario | Required observable result |
| --- | --- | --- |
| CW-01 | Consumer invokes a package script | The installed wrapper runs without a repository shell helper or repeated target expansion. |
| CW-02 | Dependency installation has no global SecretSpec | The documented supported installation supplies the compatible executable; failures and unsupported platforms are actionable. |
| CW-03 | Full-profile requirement missing | No delegated Forge command or runtime write occurs, including for lint/install/uninstall/tunnel. |
| CW-04 | Local and absent optional values | Local values arrive unchanged; absent declared optionals do not retain stale ambient values. |
| CW-05 | Shared manifest/runtime value | Local use, tunnel delivery where applicable, and upload use one coherent resolution result. |
| CW-06 | Canonical or legacy environment control | Either selects the configured target; matching dual names work; conflicting names fail without Forge execution. |
| CW-07 | Explicit target override | Explicit values win without duplicate effective options; upload and deployment environments agree. |
| CW-08 | Invalid or ambiguous targeting | Missing values, duplicates, and invalid supported targets fail before command execution; unrelated option payloads are preserved. |
| CW-09 | Configured lint | Inputs and useful results are available without injected installation/deployment flags or remote-variable writes. |
| CW-10 | Configured install or upgrade | Site/product/environment defaults and overrides work; upgrade/non-interactive/consent choices are preserved, not invented. |
| CW-11 | Configured uninstall | Target defaults work with caller-controlled interaction; no synchronization or accidental install policy occurs. |
| CW-12 | Configured tunnel | Explicit runtime members reach Forge's verified local runtime mechanism, unsupported targets fail, and no remote variables are written. |
| CW-13 | Deployment with runtime members | All selected values are validated and encrypted before exactly one deployment to the same target. |
| CW-14 | Controls-only profile or omitted runtime scope | Supported commands work without dummy app secrets, uploads, or remote deletion. |
| CW-15 | Controls selected for runtime | Selection of canonical/legacy environment, site, or product controls fails before deployment writes. |
| CW-16 | Optional manifest check | Present effective members are cross-checked for manifest-consuming workflows; omission does not prevent local availability or Forge substitution. |
| CW-17 | Unrelated arguments and special values | Boundaries and order survive; no shell expansion or command injection occurs. |
| CW-18 | Output and interaction | Private helper values remain absent from diagnostics; command results/input/streaming follow an explicit, tested confidentiality boundary. |
| CW-19 | Failure or interruption | Exit status and stage are accurate, later actions stop, and the active process tree is cleaned up within the supported platform contract. |
| CW-20 | Partial runtime write | No later upload/deploy occurs; diagnostics warn of possible changes without values or rollback claims. |
| CW-21 | Discovery or unsupported command | Help/version remain configuration-free; no resolution, provisioning, or remote mutation occurs. |
| CW-22 | Complete documented consumer workflow | Each promised script runs through the installed artifact; native/interface/live evidence and blockers are separately recorded. |

### Verification discipline

- Each behavior ticket includes its public behavioral checks and applicable
  native compatibility evidence. No separate preliminary proof suite or
  horizontal test-only implementation phase is required.
- Use synthetic, minimal fixtures, isolated working directories, bounded
  readiness waits, and reliable cleanup. Keep ordinary tests offline and
  free of credentials. Packaging checks may exercise an explicit setup
  network boundary separately; record cached versus fresh-install evidence.
- Verify interactive behavior at the same public process boundary using a
  terminal fixture only where ordinary pipes cannot establish the promise.
  Do not freeze internal subprocess nesting as an acceptance requirement.
- Actual Forge mutations or app contact require separate authorization for
  a named disposable app, site, environment, permitted changes, observations,
  and cleanup. Record unavailable live checks as blocked, not passed. User
  approval of this spec or ticket set does not grant that authorization.
- Preserve the baseline deployment regression suite. Package, test, type,
  formatting, static-analysis, and documentation checks must not be weakened
  to make the new behavior appear green.

## Out of Scope

- Runtime vault lookups or Fence Rider/provider SDKs in the deployed app.
- Reimplementing SecretSpec, inventing provider fallback, or certifying all
  providers, versions, platforms, and package managers.
- Cross-file SecretSpec inheritance or command-scoped requiredness.
- A universal Forge command proxy, arbitrary shell execution, or automatic
  target injection into commands whose interfaces have not been verified.
- A second runtime-key inventory, secret-value caches, drift management,
  scheduled rotation, automatic retries, remote deletion, or rollback.
- Automatic consent, registration, login, Forge installation, or hidden
  runtime tool downloads.
- Removing the legacy environment alias in this iteration.
- Publishing packages, creating remote tracker issues, running live Forge
  operations, committing changes, or modifying completed historical tickets
  as part of specification and ticket authoring.

## Further Notes

- This specification incorporates the user's controls-only SecretSpec
  template and multi-command Bash wrapper example. The example demonstrates
  the required execution experience; it is not an implementation prescription
  to distribute more shell scripts or evaluate command strings.
- The original user stories already covered all three variable categories,
  reusable targets, installation, and tunnel behavior. The course correction
  makes that shared wrapper first-class rather than deleting the proven
  deployment lifecycle.
- The initial delivery slices, dependency edges, existing public test seam,
  and packed-consumer seam were reviewed and approved by the user before
  local ticket creation.
- Whole-profile validation and the legacy alias are explicit planning
  policies for this iteration. Output/terminal policy, native dependency
  provisioning, and exact tunnel interfaces are implementation obligations
  that must be resolved with evidence, not claimed complete here.
- Local tickets use the `ready-for-agent` status. Work the frontier whose
  blockers are complete; readiness status does not erase blocking edges.
  The new work does not reopen or overwrite completed deployment tickets.
- Local files are the requested tracker; no external issue setup is needed.
  Run `/setup-matt-pocock-skills` before any future remote publication if a
  different tracker and triage vocabulary are required.
