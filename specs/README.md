# Specifications

This directory holds work that is **planned but not done**. Current behavior is
documented as-is under [`docs/`](../docs/); each spec here starts from that
baseline and says what is missing. When a spec is finished, move what it
established into `docs/` and delete the spec.

The original product specifications (deployment baseline AC-01–AC-18 and the
configured-workflows plan CW-01–CW-22) were retired on 2026-10-21 because the
product they described is implemented. Their scenarios are now defined in the
[acceptance criteria](../docs/reference/acceptance-criteria.md), their scope in
[what Fence Rider is for](../docs/explanation/scope-and-boundaries.md), and
their decisions in the [decision records](../docs/adr/). They remain in git
history.

| Spec | Direction | Blocked on |
| --- | --- | --- |
| [Live Forge verification](live-forge-verification.md) | Turn "controlled" evidence into live evidence | Authorization for a disposable app |
| [Unattended and agent runs](unattended-access-reason.md) | Make workflows work under SecretSpec's access-reason policy | A maintainer decision (ADR 0003) |
| [Tool compatibility and delivery](tool-compatibility-and-delivery.md) | Exercise the supported version range, platforms, and providers; decide on SDK or publication | Consumer feedback |
| [Safer variable upload](safer-variable-upload.md) | Reduce the exposure and limits of `forge variables set` positional values | Upstream Forge capability |

[`SecretSpec Atlassian Forge Integration Guide.md`](<SecretSpec Atlassian Forge Integration Guide.md>)
is the historical exploration that started the project. It is not a spec and
not an authority: its package names, command names, and sample code predate the
implementation.

## Writing a spec

Use the same shape for each: **Current state** (link to `docs/`), **Gap**,
**Scope and non-goals**, **Acceptance**, and **Evidence rules**. Acceptance rows
need an observable result. Live Forge work always needs explicit authorization;
approving a spec does not grant it.
