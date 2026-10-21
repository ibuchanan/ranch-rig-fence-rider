# Tool compatibility and delivery

Status: not started; driven by consumer feedback.

## Current state

SecretSpec and Forge are prerequisites on `PATH`
([ADR 0001](../docs/adr/0001-secretspec-cli-on-path.md),
[installation](../docs/reference/installation.md)). `fence-rider doctor` reports
versions against a supported floor and a tested ceiling. Only SecretSpec 0.21.1,
Forge CLI 14.2.0, Bun 1.4.3, macOS, and the dotenv provider are exercised. The
floors (SecretSpec 0.17, Forge 1.3) are inferred from features used, not tested.
The package is private and unpublished, requires Bun, and has no Windows
support.

## Gap

- **Version range.** Nothing proves the floors work, and nothing tracks newer
  releases beyond the tested ceiling.
- **Platforms.** Linux and Intel macOS execution is unverified; Windows has no
  process cleanup or `sh` support.
- **Providers.** Only dotenv is exercised. Vault providers add authentication
  prompts and audit entries per resolution, since a run may resolve up to three
  times ([ADR 0002](../docs/adr/0002-delegate-scope-membership-to-secretspec.md)).
- **Delivery.** `npm install` alone does not yield a working tool. ADR 0001
  deferred using the SecretSpec npm SDK and names a pivot trigger.
- **Publication.** No package is published; installation is tested from a
  locally packed artifact.

## Scope and non-goals

- Verify and widen the stated range; do not claim a matrix. Each added platform,
  provider, or version needs an executed check and a doc update.
- Delivery changes stay explicit setup steps: nothing downloads tools hidden
  inside a workflow, and help and version never provision anything.
- Not a rewrite of SecretSpec or a certification of every provider.

## Acceptance

| ID | Result |
| --- | --- |
| TC-01 | The lowest supported SecretSpec and Forge versions run the integration suite, or the floors in `doctor` are raised to what passes. |
| TC-02 | Raising the tested ceiling is done by running the suite against the newer release and recording it. |
| TC-03 | Linux execution of the documented scripts is tested, or documented as unsupported. |
| TC-04 | At least one non-dotenv provider is exercised, with its extra resolutions and prompts documented. |
| TC-05 | If ADR 0001's pivot trigger fires, the SDK replaces CLI resolution and the PATH prerequisite is removed, with the schema and scope behavior the CLI provided covered by tests. |
| TC-06 | If the package is published, the consumer checks run against the published artifact and the install limits are documented. |

## Evidence rules

Record exact versions and the platform for each result in the
[validation record](../docs/reference/validation.md). Keep ordinary tests
offline and free of real credentials; setup network use is checked separately.
