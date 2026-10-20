# Fence Rider specification

The [configured Forge workflows specification](configured-forge-workflows-spec.md)
captures the broader wrapper product contract and the next implementation set.
This document and its AC-01 through AC-18 remain the deployment baseline;
completed evidence does not certify the newly planned workflows.

Status: Single-file deployment implemented and locally verified. Live Forge
verification is blocked pending explicit authorization; see the
[workflow evidence](../docs/reference/validation.md). Compatibility checks
belong alongside implementation, not a separate proof phase.

Fence Rider is a SecretSpec-powered CLI wrapper for syncing secrets to
Atlassian Forge environments. This draft extracts product intent from the
initial exploration. The repository-owned `secretspec.toml` is the agreed
specification and validation point for local, manifest, and runtime values.
Local availability is implicit; `manifest` optionally checks Forge
manifest declarations, and `runtime` explicitly selects uploads. Other
proposed decisions and upstream compatibility checks remain open. The
current contract is recorded
in the [variable compatibility reference](../docs/reference/reference.md).

## Problem Statement

Developers maintaining Forge applications need configuration and secrets
on their workstations, in CI, and in the target Forge environment.
Local environment files couple workflows to individual machines
and make shared secret management difficult.
Manually copying values into Forge adds repetitive work
and risks uploading the wrong variables or targeting the wrong environment.

This is especially a problem for forking sample Forge apps.
Downstream developers can't benefit from the maintainer's configuration.
One strategy is to just document the needed environment variables.
Another is to include a `.env.example` file.
Neither solve the problem well.
Without "fail fast" guards on those values,
that means downstream developers can run into strange errors
that are separated in time from when/where they would set the variables.
Moreover, downstream developers new to Forge
may not realize the distinctions between:

- Local environment variables that help drive the local dev loop
- Forge manifest variables that pass URLs or configuration into deployment
- Forge runtime variables uploaded with `forge variables set` commands

Rather than tightly coupling to the `.env` approach,
we want developers to use their preferred secret manager
without adding its SDK or credentials to the deployed application.
That way, sample app maintainers can use Keeper (for example),
while downstream consumers plug into Bitwarden, Vault,
or simply `.env` if that's best for them.

## Solution

Off-the-shelf SecretSpec solves 2 problems:

- Validated environment variable specifications
  that can safely be committed in public, open-source repos.
- Secret providers that range from dotenv
  to password managers and corporate secrets management.

This CLI tool will wrap those SecretSpec capabilities
to help fill the other gaps,
like uploading variables to the Forge environment.
This project a development-time CLI
that resolves configuration through SecretSpec,
selects only explicitly designated application variables,
uploads them as encrypted Forge variables,
and delegates a supported command to the Forge CLI.
Explicit CLI options take precedence over configured deployment defaults.
SecretSpec owns provider resolution
and any supported fallback behavior.
Fence Rider owns target selection,
upload selection,
safe orchestration,
and reporting success or failure.

The initial exploration names deployment, installation,
and local tunneling as intended workflows.
Deployment is the proposed first supported workflow;
installation and tunneling require their own verified command behavior
before being declared supported.

## User Stories

1. As a Forge developer, I want to use Fence Rider as development tooling,
   so that secret-management tooling stays out of my deployed application.
2. As a team maintainer, I want SecretSpec to resolve values from our chosen
   provider, so that Fence Rider does not tie us to a particular vault.
3. As a contributor, I want to use a local environment-file provider when
   configured through SecretSpec, so that I can work without the team's vault.
4. As a maintainer, I want required configuration validated before uploads,
   so that missing values do not cause avoidable partial updates.
5. As a developer, I want reusable deployment defaults, so that routine
   commands do not repeat environment, site, and product settings.
6. As a release operator, I want explicit CLI options to override defaults,
   so that each invocation can target the intended environment.
7. As a release operator, I want uploads and the delegated command to use the
   same resolved environment, so that secrets and deployment do not diverge.
8. As a developer, I want only explicitly selected variables uploaded,
   so that local controls and provider credentials remain local.
9. As a security-conscious maintainer, I want uploaded values encrypted by
   Forge, so that the integration does not create plaintext Forge variables.
10. As a developer, I want secret values passed without shell interpretation,
    so that quotes, spaces, and shell characters do not change their meaning.
11. As a developer, I want missing, empty, and valid values distinguished,
    so that configuration is not silently discarded by truthiness checks.
12. As a maintainer, I want secret values excluded from Fence Rider's logs
    and diagnostics, so that automation output does not expose credentials.
13. As a developer, I want deployment to start only after required uploads
    succeed, so that a failed synchronization cannot look like a deployment.
14. As an operator, I want a failure to identify its stage and target without
    printing values, so that I can diagnose it safely.
15. As an operator, I want partial upload failures reported honestly,
    so that I know remote variables may already have changed.
16. As a CI maintainer, I want child-command failures reflected in the exit
    status, so that pipelines stop instead of reporting false success.
17. As a CI maintainer, I want existing non-interactive authentication and
    command options preserved, so that Fence Rider fits existing pipelines.
18. As a developer, I want unrelated Forge options forwarded intact,
    so that the wrapper does not unnecessarily replace the Forge CLI.
19. As a developer, I want missing tools or invalid configuration reported
    before remote mutation, so that setup errors are cheap to correct.
20. As a developer, I want help and unsupported-command handling to avoid
    remote writes, so that exploring the CLI cannot update my application.
21. As a developer installing an app, I want configured site and product
    defaults applied only where supported, so that installation targets are
    convenient without injecting invalid flags into other commands.
22. As a developer using a tunnel, I want documented local-secret behavior,
    so that I do not mistake remote variable synchronization for tunnel setup.
23. As a maintainer, I want the configuration and CLI compatibility contract
    documented, so that examples can be trusted and upgrades can be tested.
24. As a maintainer, I want local, manifest, and runtime variables specified
    and validated in one SecretSpec file, so that forks inherit one contract.
25. As a developer, I want implicit local values, an optional manifest check,
    and explicit runtime scope selection, so that no second inventory is needed.
26. As a developer, I want missing local or manifest requirements to stop
    deployment before uploads, so that fail-fast validation covers all inputs.
27. As a developer, I want a shared manifest/runtime value resolved once,
    so that both destinations receive the same value.

## Implementation Decisions

These are proposed product decisions, not a claim that the exploration's
sample implementation is usable as written.

### Architecture and ownership

- Run on the developer workstation or CI runner, not inside Forge functions.
  Consumers use the tool as a development dependency or development utility.
- Use the existing TypeScript and Bun project tooling. Do not add a provider
  SDK, custom vault implementation, or application-runtime integration.
- Integrate with the SecretSpec CLI and the Forge CLI as external tools.
  SecretSpec owns its configuration format, profiles, provider authentication,
  and fallback policy. Fence Rider must not invent a parallel provider schema.
- Treat SecretSpec profiles and Forge environments as separate concepts.
  A resolved profile can supply a Forge environment default; matching names
  must not imply an automatic mapping.

### Compatibility contract and implementation verification

- Use the candidate versions and interfaces recorded in the reference.
  Verify compatibility while implementing each behavior, not through a
  separate preimplementation proof phase. The exploration's package names,
  commands, and provider examples are not authoritative contracts. Record
  observed support and raise contradictory upstream behavior for review.
- Declare and validate all variables through native SecretSpec profiles in
  the repository-owned `secretspec.toml`. Local availability is implicit.
  Optional `manifest` scope members are cross-checked against Forge manifest
  declarations; `runtime` is the sole upload allowlist and replaces the
  exploration's `forge_upload` name. No separate inventory is added.
- Resolve the full active profile once locally (no scope filter applied).
  All variables are available in the local process environment, including
  to delegated Forge processes, without requiring explicit `local` scope
  declaration. Declarations outside scopes are permitted.
- Include all local and manifest inputs in full-profile validation before
  remote writes. Resolved application values are available to delegated
  Forge processes without a manifest injection allowlist. Provider-private
  state is not automatically gathered or forwarded, and local availability
  does not authorize any upload.
- Support one repository-owned `secretspec.toml` in the first release. Reject
  non-empty `project.extends` before resolution or Forge interaction. Omitted
  or empty `extends` is accepted subject to native validation; malformed
  declarations fail rather than being ignored.
- Read scope lists directly from that file through a TOML parser. Use native
  schema for effective profile names and one full-profile export for values,
  with the same file and explicit profile. Profile inheritance within the
  file remains native; cross-file graph handling is deferred.
- Use one resolved value for a variable shared by local and runtime use.
  Metadata inspection must not trigger a second provider resolution.
- An omitted runtime scope or valid empty active-profile intersection means
  no uploads, with existing remote values untouched. Native empty scope
  declarations remain invalid; omit the scope rather than inventing a dummy
  entry. Unscoped declarations remain valid local configuration.
- Ambient SecretSpec scope settings must not narrow full-profile validation
  or local resolution. Unknown explicitly requested scopes remain errors.
- Confirm that the selected SecretSpec version can resolve the necessary
  values and distinguish missing values without exposing them in logs.
- Verify Forge's encrypted-variable command, accepted environment options,
  and deployment requirements. Remote updates must not be described as
  immediately active in an already deployed application without evidence.
- A compatibility check must establish a coherent resolved value set before
  any remote writes. Do not assume separate resolution calls return the
  same values if a provider rotates a secret between calls.

### Target and argument contract

- Preserve the intent of the exploration's local defaults: `FORGE_ENV`,
  `FORGE_SITE`, and `FORGE_PRODUCT`. Confirm their representation against
  SecretSpec's supported configuration model.
- Resolve the Forge environment in this order: explicit command option,
  configured default, then `development`. Use the result for every upload
  and for the delegated environment-aware command.
- Apply site and product defaults only to commands that accept them.
  Do not upload these local control values as application variables.
- Support the documented short and long option forms of the selected Forge
  version, including equals syntax where supported. Reject missing option
  values and ambiguous duplicate target options before remote writes.
- Preserve other arguments, their values, argument boundaries, and order.
  Do not forward wrapper-only options or append unsupported Forge flags.
- Proposed safety change from the exploration: no command prints help and
  exits successfully instead of implicitly deploying. Help, version output,
  and unsupported commands must not resolve secrets or mutate remote state.

### Command lifecycle

- For deployment: validate the invocation and prerequisites, resolve values,
  validate local, manifest, and runtime inputs, prepare the manifest process
  environment, upload runtime members encrypted to the resolved environment,
  then delegate deployment to Forge with the same manifest inputs.
- Do not deploy if full-profile resolution, validation, or any required
  upload fails. Omitted runtime scope and valid empty profile intersections
  permit deployment without uploads; neither causes remote deletion.
- When a `manifest` scope exists, check that its effective members appear
  in Forge's `environment.variables`, accepting native strings and keyed
  objects. A mismatch fails before remote writes. Scope omission skips this
  metadata check, not validation or local value availability.
- The manifest scope is not an injection allowlist. Forge validates actual
  substitutions independently and knows nothing about SecretSpec scopes.
  This metadata check does not promise a complete Forge lint run before
  uploads or require every Forge variable to belong to the optional scope.
- For installation: verify a separate contract for target defaults and
  whether synchronization is necessary. Installation must not be assumed
  to activate changed remote variables in existing deployments.
- For tunneling: verify supported environment targeting and local variable
  injection with the selected Forge version. Do not reuse deployment's
  remote-upload lifecycle or assume arbitrary Forge environments work.
- Until installation and tunnel contracts are verified, reject those wrapper
  workflows without side effects and direct users to the Forge CLI.
  Expanding support requires acceptance examples for each lifecycle.

### Values, security, and failures

- Validate all selected keys and values before starting uploads. A missing
  required value is an error. An absent optional value is omitted.
  An explicitly empty string is not equivalent to an absent value; verify
  platform support and either preserve it or reject it with a clear error.
- Accept only value types supported by the verified integration contract.
  Do not silently stringify objects or discard values such as `0` or `false`.
- Local controls are consumed for target selection and environment setup,
  not implicitly uploaded. Shared variables use the same resolved value
  locally and for upload. Provider-private credentials are not automatically
  gathered or forwarded, and no resolved value is logged.
- Pass subprocess arguments as distinct values, not interpolated shell text.
  Do not write resolved secrets to temporary files or persist a local cache.
- Fence Rider must not log resolved values, secret-bearing command lines,
  or raw helper output that could contain secrets. Sanitize helper failures
  and keep progress messages limited to stages, variable names, and targets.
- Do not claim protection from operating-system process inspection if the
  Forge CLI requires values in process arguments. Document that limitation
  and prefer a safer supported input mechanism if one is available.
- Stop at the first failed upload. Report that earlier uploads may have
  succeeded. No automatic rollback, deletion, or recovery promise is made.
- Preserve the delegated command's numeric exit status. Tool launch failures,
  malformed results, and signal termination must never become success.
  Interruption must not leave the delegated process running unintentionally.
- Use existing tool authentication. Do not add login, app registration,
  provider installation, or dependency download as hidden side effects.

## Testing Decisions

### Proposed test seam

Use one public boundary: invoke Fence Rider as a subprocess in an isolated
sample project, with controlled SecretSpec and Forge executables. Observe
exit status, redacted output, and the external tool interactions. Exercise
real argument parsing and orchestration without a vault or a live Forge app.

This seam was confirmed and implemented in the CLI test files in `tests/`; it avoids
private helper tests. Ticket 07 also confirms observable validation-command
output/status as a seam in `tests/check.test.ts`. Bun is the configured test
runner. The [acceptance map](../docs/reference/deployment.md#acceptance-traceability)
records passing checks and the blocked live Forge boundary.

### Acceptance criteria

| ID | Scenario | Required observable result |
| ----- | ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| AC-01 | Valid deployment with selected variables | Only selected application variables are uploaded, all encrypted, before one deployment to the same environment. |
| AC-02 | Explicit target differs from defaults | The explicit environment wins for uploads and deployment; forwarded options remain intact. |
| AC-03 | Environment is not specified | The configured environment is used, or `development` when no default exists. |
| AC-04 | Required value, tool, or configuration is invalid | The invocation fails before any upload or deployment and explains the failing stage without values. |
| AC-05 | Runtime scope omitted or empty effective membership | No uploads or deletion occur; full-profile validation still runs. Literal empty native scopes fail; optional and empty values follow the verified contract. |
| AC-06 | Upload fails after an earlier success | No later upload or deployment occurs; output warns of partial updates and the process fails. |
| AC-07 | Delegated Forge command exits unsuccessfully | Fence Rider returns the same numeric exit status. Launch or signal failure also returns nonzero. |
| AC-08 | Values contain spaces, quotes, newlines, or shell syntax | Each supported value reaches Forge unchanged as one value and no shell expansion occurs. |
| AC-09 | Helper output contains a synthetic secret on failure | The synthetic secret appears in neither Fence Rider's output nor its diagnostic messages. |
| AC-10 | Help, version, no command, or unsupported command | No secret resolution or remote mutation occurs; help succeeds and unsupported commands fail clearly. |
| AC-11 | Ambiguous target or option without a value | The invocation fails before secret resolution and remote mutation. |
| AC-12 | Unselected provider credential or local control exists | It is not uploaded. Resolved secrets are not written to local files. |
| AC-13 | Delegated command is interrupted | Fence Rider reports non-success and does not leave the child running. |
| AC-14 | Required local or manifest input is missing | Validation fails before every upload and deployment, including when runtime scope membership resolves to nothing. |
| AC-15 | Local variable has no named scope | Full-profile resolution validates it and makes its value available to local Forge processes. Substitution needs no SecretSpec manifest scope; local presence never authorizes a runtime upload. |
| AC-16 | A local variable also belongs to runtime | Local use and encrypted upload receive the same once-resolved value; manifest membership only adds a declaration check. |
| AC-17 | Manifest scope present or omitted | Present effective members must appear in Forge environment.variables as strings or keyed objects; a missing declaration fails before writes. Omission skips the cross-check, not local availability or SecretSpec validation. |
| AC-18 | Cross-file inheritance requested | Non-empty or malformed project.extends fails before resolution or Forge interaction. Omitted or empty extends is accepted subject to native validation; in-file profile inheritance still works. |

### Compatibility validation

- Build a minimal real-SecretSpec integration check with synthetic values
  alongside the deployment slice in ticket 03. Extend it for edge cases in
  ticket 05 and reuse it for final workflow verification in ticket 07.
  Ticket 01 settles the contract; it requires no executable proof suite.
- Validate Forge behavior separately with a disposable development app and
  explicit authorization. Record versions and redacted outcomes, not values.
- Confirm encryption, target consistency, deployment activation behavior,
  and any eventual installation or tunneling support with live evidence.
- Keep ordinary tests deterministic, independent, parallel-safe, and free of
  real credentials or network access. Use small synthetic fixtures.
- The accepted tradeoff is that controlled executables cannot prove upstream
  compatibility. Contract checks and an authorized smoke test cover that gap;
  a broad provider or operating-system matrix is not an initial requirement.

## Out of Scope

- Secret lookups inside deployed Forge functions or bundling vault SDKs.
- A new secret manager, provider SDK, authentication service, or TOML dialect.
- Cross-file SecretSpec inheritance, `extends` traversal, or parent overlays
  in the first implementation. Native in-file profile inheritance remains
  supported.
- Automatic fallback on provider errors beyond SecretSpec's verified policy.
- Secret rotation scheduling, remote drift detection, or a secret-value cache.
- Deleting remote variables that are no longer selected.
- Atomic multi-variable updates or automatic rollback after partial failure.
- General support for every Forge command or automatic flag injection into
  commands that have not been verified.
- Registering apps, changing manifests, granting scopes, or installing tools.
- Publishing a package or making live deployments while writing this spec.

## Further Notes

- Source: [initial exploration][exploration]. Preserve it as historical
  input, not authoritative API reference.
- The repository currently contains project tooling and template documents,
  but no application implementation, tests, domain glossary, or ADRs.
- The exploration's sample code is not an acceptance oracle: it interpolates
  secrets into shell commands, skips falsy values, resolves values twice,
  treats some process failures as success, and applies one upload lifecycle
  across commands whose semantics differ.
- Proposed departures from that exploration are explicit help-only behavior
  without a command, fail-closed validation, and deployment-first delivery
  while installation and tunneling remain compatibility-gated.
- Ticket 01 records the agreed single-file contract and public subprocess
  test boundary. Deployment implementation can proceed without preliminary
  proofs; upstream behavior is verified through the implementing tickets.
  Installation and tunneling remain deferred, not readiness blockers.
- No issue tracker or project-specific triage vocabulary is configured in
  the available context. Run `/setup-matt-pocock-skills` before publishing
  this specification through the `to-spec` workflow. No issue has been
  created and no `ready-for-agent` label has been applied.

[exploration]: <SecretSpec Atlassian Forge Integration Guide.md>
