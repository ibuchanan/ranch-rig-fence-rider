# Safer variable upload

Status: waiting on upstream Forge capability.

## Current state

`fence-rider variables` runs `forge variables set --encrypt KEY VALUE` once per
runtime member. Forge CLI 14.2.0 takes the value as a positional argument, so
the value is visible to operating-system process inspection while the command
runs ([reference](../docs/reference/reference.md#forge-boundaries-and-failures)).
Empty values and values starting with a dash are refused before any upload
because Forge may read them as options. A failure after the first upload leaves
earlier uploads in place, with a warning and no rollback.

## Gap

- A non-interactive way to pass a value that avoids process arguments, such as
  standard input or a file, has not been found in Forge. If one appears it would
  remove the exposure and allow empty and dash-leading values.
- Every `variables` run rewrites every runtime member, even unchanged ones
  ([ADR 0007](../docs/adr/0007-split-variables-from-generated-forge-commands.md)).
  Forge is not known to expose stored values to compare against, so skipping unchanged
  ones is not possible without keeping local state.

## Scope and non-goals

- Adopt a safer input mechanism only if Forge documents it and a version floor
  can be stated.
- No local value cache or hash store to detect changes, and no remote deletion,
  drift detection, retries, or rollback. These are
  [non-goals](../docs/explanation/scope-and-boundaries.md#what-it-does-not-do).

## Acceptance

| ID | Result |
| --- | --- |
| SU-01 | Uploaded values do not appear in the child process arguments, verified by a process-inspection test against a controlled Forge. |
| SU-02 | Empty and dash-leading values are either accepted by the new mechanism, with Forge-side evidence, or still refused with the existing message. |
| SU-03 | Forge versions without the mechanism fall back to the current behavior or fail clearly, per the documented floor. |
| SU-04 | The positional limitation text in the reference and how-to guides is updated to match. |
