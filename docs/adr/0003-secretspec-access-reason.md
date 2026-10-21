---
status: proposed
---

# Open question: how Fence Rider satisfies SecretSpec's access-reason policy

SecretSpec's `require_reason` policy defaults to `"agents"`. In an agent
session, `secretspec export` and `secretspec check` fail with "Accessing
secrets requires a reason" unless `--reason` or `SECRETSPEC_REASON` is set.
Fence Rider passes neither `--reason` nor `--caller`, so any workflow run from
an agent session fails at its first resolution. The tests pass because they do
not run as an agent. This is unresolved on purpose: the answer depends on how
the maintainer and other consumers use Fence Rider, so it will be revisited
once that is clearer.

## Options

- **Pass `--caller fence-rider`** (with optional version/operation context).
  Records who is accessing secrets for audit, but SecretSpec says caller
  context does not satisfy the reason policy, so it does not fix the failure.
- **Rely on pass-through of `SECRETSPEC_REASON`.** Already works, because the
  environment is inherited. The consumer states why, which suits a human or
  agent deciding per session. Nothing to build; it needs documenting.
- **Supply a reason from Fence Rider** (for example derived from the command
  being run). Works unattended, but Fence Rider would be asserting a purpose on
  the user's behalf, which may defeat the intent of the policy.

## Not yet decided

Which option, or combination, to adopt; whether `--caller` is worth adding for
audit alone; and whether the pass-through should be documented as the supported
path for agent sessions.
