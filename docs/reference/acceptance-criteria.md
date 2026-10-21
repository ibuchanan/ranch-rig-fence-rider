# Acceptance criteria

The scenarios that the test suite refers to by ID. This page defines what each
ID requires today; the tests are the evidence. The tested versions and the
evidence still missing are in [tested versions and evidence](validation.md).

IDs are stable names. Where the contract changed after an ID was first
written (see the [decision records](../adr/)), the text below is the current
requirement.

## Variables and deployment

`variables` is the only command that uploads. `deploy` prints a script that runs
`forge deploy`, so "upload then deploy" scenarios mean `variables` followed by
the generated deploy script.

| ID | Scenario | Required observable result |
| --- | --- | --- |
| AC-01 | Valid upload and deployment | Only selected runtime variables are uploaded, all encrypted, by `variables`; the deploy script then deploys to the same environment. |
| AC-02 | Explicit target differs from the default | The explicit environment wins for uploads and deployment; forwarded options remain intact. |
| AC-03 | Environment not specified | The resolved `FORGE_ENVIRONMENT` is used, or `development` when it is absent. |
| AC-04 | Required value, tool, or configuration is invalid | The invocation fails before any upload or deployment and names the failing stage without values. |
| AC-05 | Runtime scope omitted or effectively empty | No uploads or deletion occur; full-profile validation still runs. A literal empty native scope fails. |
| AC-06 | Upload fails after an earlier success | No later upload runs; output warns of partial updates and the process fails, so a chained deploy does not run. |
| AC-07 | Delegated Forge command exits unsuccessfully | The exit status is Forge's own. Launch or signal failure is nonzero. |
| AC-08 | Values contain spaces, quotes, newlines, or shell syntax | Each supported value reaches Forge unchanged as one value, with no shell expansion. |
| AC-09 | Helper output contains a synthetic secret on failure | The secret appears in neither Fence Rider's output nor its diagnostics. |
| AC-10 | Help, version, no command, or unsupported command | No secret resolution or remote mutation occurs; help succeeds and unsupported commands fail clearly. |
| AC-11 | Ambiguous target or option without a value | The invocation fails before secret resolution and remote mutation. |
| AC-12 | Unselected provider credential or local control exists | It is not uploaded, and resolved secrets are not written to local files. |
| AC-13 | A supervised command is interrupted | Fence Rider reports non-success and leaves no child running. Applies to `variables`; generated scripts `exec` into the tools, which own their signals. |
| AC-14 | Required local or manifest input is missing | Validation fails before every upload and deployment, including when runtime scope membership resolves to nothing. |
| AC-15 | Local variable has no named scope | Full-profile resolution validates it and makes it available to local Forge processes. Local presence never authorizes an upload. |
| AC-16 | A local variable also belongs to runtime | Local use and encrypted upload receive the same once-resolved value. |
| AC-17 | Manifest scope present or omitted | Present members must appear in Forge `environment.variables` as strings or keyed objects, or `variables` fails before writes. Omission skips the cross-check, not local availability or SecretSpec validation. |
| AC-18 | Profile or file inheritance | SecretSpec resolves inheritance, including `project.extends`; Fence Rider passes no `--file` or `--profile` and reads scope membership from SecretSpec. |

## Configured workflows

| ID | Scenario | Required observable result |
| --- | --- | --- |
| CW-01 | Consumer invokes a package script | The installed wrapper runs without a repository shell helper or repeated target expansion. |
| CW-02 | SecretSpec and Forge are prerequisites | Missing or unsupported tools are reported actionably by `doctor`; nothing is downloaded. |
| CW-03 | Full-profile requirement missing | No Forge command or runtime write occurs, including for lint, install, uninstall, and tunnel. |
| CW-04 | Local values and absent optional values | Local values arrive unchanged; stale ambient values for absent optionals do not leak where Fence Rider resolves values itself, and `doctor` warns where `secretspec run` leaves them. |
| CW-05 | Shared manifest/runtime value | Local use, tunnel delivery, and upload use one resolution result. |
| CW-06 | Environment control | `FORGE_ENVIRONMENT` selects the configured target; there is no legacy alias. |
| CW-07 | Explicit target override | Where options are accepted (`variables`, `deploy`, `tunnel`) the explicit value wins without duplicate effective options. `install` and `uninstall` take targets from the profile only. |
| CW-08 | Invalid or ambiguous targeting | Missing values, duplicates, and unsupported targets fail before command execution; unrelated option payloads are preserved. |
| CW-09 | Configured lint | Inputs and useful results reach Forge, with no injected target flags and no remote-variable writes. |
| CW-10 | Configured install or upgrade | Profile targets apply; upgrade, consent, and non-interactive choices are preserved, never invented. |
| CW-11 | Configured uninstall | Profile targets apply with caller-controlled interaction; no synchronization or install policy is added. |
| CW-12 | Configured tunnel | Runtime members reach Forge's local runtime mechanism, unsupported environments fail, and no remote variables are written. |
| CW-13 | Deployment with runtime members | All selected values are validated and encrypted by `variables` before the deploy script deploys to the same target. |
| CW-14 | Controls-only profile or omitted runtime scope | Supported commands work without dummy secrets, uploads, or remote deletion. |
| CW-15 | Controls selected for runtime | Selecting `FORGE_ENVIRONMENT`, `FORGE_SITE`, or `FORGE_PRODUCT` for runtime fails before writes. |
| CW-16 | Optional manifest check | Present members are cross-checked by `variables` and `doctor`; omission does not prevent local availability or Forge substitution. |
| CW-17 | Unrelated arguments and special values | Boundaries and order survive; no shell expansion or command injection occurs. |
| CW-18 | Output and interaction | Private helper values stay out of diagnostics; user-facing Forge output, input, and streaming follow a tested, documented, unredacted boundary. |
| CW-19 | Failure or interruption | Exit status and stage are accurate and later actions stop; for supervised commands the process tree is cleaned up on POSIX. |
| CW-20 | Partial runtime write | No later upload runs; diagnostics warn of possible changes without values or rollback claims. |
| CW-21 | Discovery or unsupported command | Help and version need no configuration; no resolution or remote mutation occurs. |
| CW-22 | Complete documented consumer workflow | Each documented script runs through the installed artifact; native, interface, and live evidence and blockers are recorded separately. |
