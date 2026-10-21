# Unattended and agent runs

Status: open decision, recorded as [ADR 0003](../docs/adr/0003-secretspec-access-reason.md).

## Current state

SecretSpec's `require_reason` policy defaults to `"agents"`. In an agent
session `secretspec export` and `check` fail with "Accessing secrets
requires a reason" unless `--reason` or `SECRETSPEC_REASON` is set. Fence Rider
passes neither `--reason` nor `--caller`, so any workflow started from an agent
session fails at its first resolution. `SECRETSPEC_REASON` set in the
environment already passes through, but this is not documented as supported.
The test suite does not run as an agent, so it does not exercise this.

## Gap

Decide how the workflows behave under a reason policy, then document and test
it. The options in the ADR are to document pass-through of `SECRETSPEC_REASON`
(nothing to build), to add `--caller fence-rider` for audit only (it does not
satisfy the policy), or to supply a reason derived from the command (works
unattended but asserts a purpose for the user).

## Scope and non-goals

- Whichever option is chosen must keep the reason user-owned; Fence Rider
  must not fabricate a justification that defeats the policy's intent.
- Applies to every command that resolves, including the generated scripts and
  `doctor --resolve`.
- Not a change to SecretSpec's policy or to provider authentication.

## Acceptance

| ID | Result |
| --- | --- |
| AR-01 | With the policy enforced and a reason supplied the documented way, every workflow resolves. |
| AR-02 | With the policy enforced and no reason, each workflow fails before Forge with a message that names the fix and prints no value. |
| AR-03 | If `--caller` is adopted, it appears in SecretSpec's audit entry and never changes policy outcomes. |
| AR-04 | The choice is recorded by moving ADR 0003 to `accepted` and documenting it in the how-to guides. |

## Evidence rules

Test with a fake SecretSpec that enforces the policy, and confirm the real
behavior once with the installed SecretSpec. No real credentials.
