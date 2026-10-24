# Specifications

This directory holds planned work and the record of how specifications map to
working code. Consumer documentation lives under [`docs/`](../docs/).

[Tested versions and evidence](validation.md) is the maintained validation
record: it maps acceptance scenarios to tests and separates demonstrated
behavior from gaps. It stays here even when the corresponding code is complete.

The future-work specifications below start from current behavior and identify
what is missing. When that work is finished, update the consumer docs and the
validation record, then retire the completed plan.

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

## Configuration conventions

[Semantic provider conventions](secretspec-provider-conventions.md) proposes
storage-role names based on sharing boundary and sensitivity. The consumer
[provider reference](../docs/reference/forge-tooling.md) and
[setup guides](../docs/how-to/configure-user-providers.md) adopt those names as
a configuration convention, not an implemented backend security policy.
Documenting the convention does not change operator bindings, stored values,
or remote Forge state.

## Writing a spec

Use the same shape for each: **Current state** (link to `docs/`), **Gap**,
**Scope and non-goals**, **Acceptance**, and **Evidence rules**. Acceptance rows
need an observable result. Live Forge work always needs explicit authorization;
approving a spec does not grant it.
