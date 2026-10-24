# What Fence Rider is for, and where it stops

Fence Rider is a development-time wrapper for the Forge CLI. It runs on a
workstation or CI runner, never inside a deployed Forge function. This page
explains the problem it addresses, who owns each part of the work, and what it
deliberately leaves alone. Exact behavior lives in the
[variable compatibility reference](../reference/reference.md); the reasoning
behind individual changes lives in the [decision records](../adr/).

## The problem

A Forge app needs configuration in three places: local tooling, the manifest
parser, and the deployed runtime
([why those differ](three-kinds-of-env-vars.md)). Without help, a sample-app
fork inherits prose instructions or a `.env.example`, and a missing value surfaces
late, far from where it should have been set. Targeting mistakes can also send
runtime variables to one environment and the deployment to another.

Tying the workflow to one secret manager or to `.env` files would push that
choice onto every downstream developer. Fence Rider instead lets a maintainer
declare requirements once in a committed `secretspec.toml`, while each
developer binds semantic storage roles to their own backends without changing
the repository or adding an SDK to the app. Non-secret config may use dotenv;
secret roles require approved secret backends under the
[provider convention](../reference/forge-tooling.md#storage-roles).

## Who owns what

| Owner              | Responsibility                                                                                                                                                                          |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SecretSpec         | The declaration format, profiles and inheritance, scopes, provider selection and authentication, fallback behavior, and every required/optional rule                                    |
| Forge CLI          | Manifest parsing and substitution, installation, deployment, tunnels, the encrypted-variable store, and its own authentication                                                          |
| Fence Rider        | Mapping configured controls to Forge targets, selecting runtime members for upload, generating the scripts that run Forge under `secretspec run`, and reporting failures without values |
| The package script | Workflow policy: consent, upgrades, non-interactive operation, and the order of `variables` and `deploy`                                                                                |

Fence Rider adds no provider schema, variable inventory, or configuration
format of its own. It asks SecretSpec for answers (scope membership, declared
names, whether values resolve) rather than deriving those answers from TOML, so
inheritance and validation stay SecretSpec's. Doctor makes a small advisory
TOML read to warn about unrecognized root-file scope names; effective scope
membership still comes from SecretSpec. SecretSpec and Forge are
prerequisites on `PATH`; Fence Rider does not install them, log in to them, or
register apps. A SecretSpec profile is not a Forge environment, and neither
name is derived from the other.

## Design commitments

- **Fail before the first remote change.** `variables` resolves the whole
  profile and validates the runtime selection before it writes anything.
  Generated scripts run under `secretspec run`, so SecretSpec reports a missing
  required value before Forge starts.
- **Select uploads explicitly.** Only members of the `runtime` scope are
  uploaded, always encrypted. An absent scope means no uploads, never "upload
  everything", and never deletes remote values.
- **One export, one value per upload invocation.** `variables` reuses its
  exported value for the local child environment and upload. A separate deploy
  or tunnel resolves again; there is no cross-command snapshot of a provider.
- **No shell interpretation of values.** Arguments reach Forge as distinct
  values. Generated scripts quote what they embed and never contain a resolved
  value.
- **No persistence.** Fence Rider writes no resolved value to a file and keeps
  no cache.
- **Honest failure reporting.** A failed upload stops the later ones and warns
  that earlier ones may have changed remote state. Exit status and signals
  belong to the tools that run, because generated scripts `exec` into them.
- **Help and version are inert.** They resolve no secrets and contact nothing.

## What it does not do

- Look up secrets, or bundle vault or provider SDKs, inside a deployed app.
- Replace SecretSpec: no new provider, authentication service, or TOML dialect.
- Enforce semantic provider bindings. Alias names do not prove backend safety,
  project/profile isolation, or deliberate sharing; operators must review those.
- Provide a general command proxy or arbitrary shell execution. Only the
  documented commands are supported, and target flags are injected only where
  the Forge command accepts them.
- Delete remote variables that are no longer selected, detect drift between
  local and remote values, schedule rotation, or cache values.
- Make several uploads atomic, retry them, or roll them back.
- Infer consent. Approvals, scope consent, upgrades, and non-interactive
  switches stay explicit in the package script.
- Redact Forge output. Forge's own output and the app's logs stream through
  unchanged and may show values; Fence Rider's own messages never do.
- Hide values from local process inspection, because the Forge CLI takes an
  uploaded value as a positional argument.
- Support Windows, or certify any provider other than the dotenv provider it
  is tested against.

Work that would change these limits, or confirm behavior that is only
simulated today, is tracked in the [specifications](../../specs/README.md).

## Related material

- [Why Forge has three kinds of environment variables](three-kinds-of-env-vars.md)
- [Variable compatibility reference](../reference/reference.md)
- [Decision records](../adr/)
