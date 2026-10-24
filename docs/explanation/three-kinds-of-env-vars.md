# Why Forge has three kinds of environment variables

An environment variable is a name and a value available to a particular
process. It is not a shared setting that automatically follows an application
from a developer's terminal into the cloud. In Forge development, the same
phrase covers three different consumers: local tooling, the manifest parser,
and the deployed application.

That distinction explains a common source of confusion: a value can be
available in a terminal and still be missing from an app. The important
questions are who needs the value, when they need it, and how it reaches them.

Fence Rider's design brings the declarations and validation for these three
categories into one SecretSpec specification. It does not turn their
separate delivery mechanisms into one environment. The deployment workflow
is implemented and locally tested; live Forge activation remains unverified.
This explanation describes the model and the Forge boundaries it respects.
Exact rules and compatibility evidence belong in the
[variable compatibility reference](../reference/reference.md).

## Local variables guide the development workflow

Local variables are consumed by tools running on a workstation or CI runner.
For example, Fence Rider can use `FORGE_ENVIRONMENT` to choose a deployment target.
That value controls an operation; the deployed app does not need to receive
it merely because the deployment tool did.

Here, "local" describes the consumer rather than a physical laptop. A CI
runner is also local to the tool process. A variable may come from a vault,
an environment file, or another SecretSpec provider without changing its
role in the workflow.

Local availability is the starting point, not a named destination that
needs an explicit `local` scope. SecretSpec can resolve the whole active
profile into a local process environment. A variable outside Fence Rider's
recognized scopes is still valid, validated local configuration, and the
resolved application environment is available to delegated Forge tooling.

Local values do not automatically become Forge runtime variables. Uploading all
of them would confuse deployment controls with app configuration and could
expose credentials that only a local tool needs. Conversely, declaring a local
value does not mean Fence Rider supports every development command that might
use it. Variable upload, deployment, lint, install/upgrade, uninstall, and
development tunnel are supported configured workflows, not a general-purpose
command runner.

## Manifest variables shape the deployed configuration

Manifest variables are consumed by the Forge CLI while it parses the
manifest. Consider a service URL used to configure a remote endpoint. The
CLI needs that URL while interpreting the app's configuration, before the
app runs.

The URL reaches the parser through the Forge CLI process environment. Forge
also requires the variable to be declared in the manifest's native
`environment.variables` field. A variable stored only in the remote Forge
runtime environment does not supply that local parser input.

This creates two declarations with different jobs, not two competing sources
of truth. SecretSpec describes the value's requirements. The Forge manifest
describes where the parser can substitute it. An optional SecretSpec
`manifest` scope adds a consistency check: its members must also be declared
for use in the Forge manifest. It does not decide which values are injected
into the local process environment.

Without that scope, a resolved local value can still supply a substitution.
Forge validates its own manifest declarations; it does not know whether a
SecretSpec scope exists. Omitting the scope alone therefore does not cause
Forge lint to fail. The optional check helps keep the two files consistent
without replacing Forge's parser or SecretSpec's validation rules. `variables`
runs it before the first upload; the commands that print scripts check nothing
themselves, so `fence-rider doctor` is where that check lives for them.

A manifest input is not automatically a runtime variable. Its value can
influence the deployed configuration without becoming an entry in the app's
`process.env`. It is also not necessarily private: the manifest field that
uses it may expose configuration through the resulting app behavior.

## Runtime variables configure the running app

Runtime variables are consumed by the app executing inside Forge. An API
credential needed by a backend function is a typical example. The developer
workstation's environment is not the environment of that remote function.

Forge provides a separate variable-setting mechanism for these values.
Fence Rider's `variables` command uploads runtime-selected values with
encryption enabled, and `deploy` is a separate step, as `forge variables set`
and `forge deploy` are separate in Forge. Run `variables` only when values
change. The deployment matters: changing a stored remote variable does not
update the values used by an already deployed app until it is redeployed to that
environment. A package script that chains the two keeps them together when you
want both.

Runtime variables belong to an app and a Forge environment. A value uploaded
to development does not automatically appear in staging or production.
Likewise, choosing an installation site is not a substitute for selecting
the environment whose runtime configuration is being changed.

Encryption protects stored remote values; the function still receives a
usable value at runtime. It does not make a value safe to log, return to a
browser, or embed in public configuration. Neither local nor manifest values
are necessarily non-secret, and not every runtime value is a credential.
Destination and sensitivity are separate concerns.

## One declaration can serve more than one consumer

These categories describe destinations, not mutually exclusive value types.
A service URL might be needed both in manifest configuration and by backend
code. Duplicating its declaration would create two values that could drift
apart even though they represent the same setting.

All declared variables are resolved and validated locally, so a separate
`local` scope is unnecessary. The two recognized scopes add different
behaviors to that local baseline: `manifest` adds a declaration check, and
`runtime` authorizes an encrypted remote upload.

A variable can be declared once and included in both scopes. Within one
`variables` invocation, the local upload process and remote variable store
receive the value from the same export. Scope queries supply names, not a
second set of values. A later deploy or tunnel resolves independently, so a
provider change between commands can still change the value. This is not a
vault-wide snapshot. Scope membership does not determine sensitivity.

A variable outside both scopes remains local configuration. In particular,
no `runtime` scope means no uploads, not an error and not a request to upload
everything. A valid runtime scope can also have no members in the active
profile. Omitting the scope expresses that absence without an invalid empty
native scope declaration. Neither case erases previously stored remote
variables: selecting values to upload is not remote state reconciliation.

Profiles answer a different question. They select a set of declarations,
defaults, and provider behavior; the recognized scopes add checks or upload
selection within that configuration. A SecretSpec profile named `production`
does not, by its name alone, select Forge's production environment.

## A provider is a source, not a destination

Storage and delivery answer different questions. Storage has two independent
dimensions: whether a value is intentionally shared across projects or isolated
to one project, and whether it is non-secret config or a confidential secret.
The [provider convention](../reference/forge-tooling.md#storage-roles) combines
these into `shared_config`, `project_config`, `shared_secrets`, and
`project_secrets`. These names describe roles, not backend products or places
where configuration files live.

For example, a preferred Forge site can use `shared_config`, while an app's
bearer token uses `project_secrets`. A service URL stored as `project_config`
can serve both manifest and runtime consumers; a credential can stay local.
The native scope list is named `secrets`, but membership does not classify
sensitivity. `providers` selects storage, `runtime` selects uploads, and
`manifest` selects consistency checks.

Plaintext dotenv is suitable only for config under this convention; secrets
require an approved backend. Changing the storage backend does not remove the
need for manifest injection or remote runtime uploads. Alias names alone do
not enforce protection or namespaces: the backend and its addressing do.

That separation is especially useful for sample app forks. A maintainer can
use one provider and a downstream developer another, while both share the
repository's `secretspec.toml`: the required inputs and their destination
scopes remain visible and reviewable without committing actual secrets.
Provider authentication stays a SecretSpec concern rather than becoming
application runtime code.

## Validation belongs before the first remote change

A deployment depends on more than its runtime credentials. A missing local
target setting or required manifest URL can make it invalid even when every
runtime value is present. Validating runtime values alone would allow remote
uploads to succeed before a later manifest error stops deployment.

Fence Rider's intended boundary therefore validates the complete deployment
configuration before any upload; `variables` does so before its first write.
SecretSpec owns the supported declaration constraints and provider resolution;
Fence Rider adds checks for routing, control values, and Forge's input
restrictions. One specification covers all three categories without pretending
that all three have the same consumer.

This early boundary prevents avoidable partial changes caused by invalid
inputs. It cannot make a sequence of remote writes atomic: an upload can
still fail after an earlier upload succeeds. The distinction between input
validation and remote execution remains important even with one source of
variable specifications.

The central idea is that **one specification does not mean one destination**.
Local tooling, manifest parsing, and application execution need different
values at different times. Shared declarations and explicit scopes make
those boundaries understandable instead of hiding them behind a single
label, "environment variables."

## Tool delivery is not runtime delivery

Installing the wrapper as development tooling supplies a command entrypoint,
not app configuration. SecretSpec itself is a separately installed prerequisite
on `PATH`, like Forge, so no workflow downloads anything during a deployment and
a missing or mismatched tool is visible before any remote change.

The installed scripts expose policy while configuration supplies targets.
Approvals, scope consent, upgrades, and non-interactive execution remain visible
choices instead of consequences of declaring a variable. Lint, deploy, tunnel,
install and uninstall do not run Forge at all: they print a script that hands
the job to `secretspec run`, which injects the resolved profile itself, so
signals, exit status and interactive input belong to SecretSpec and Forge rather
than to a Fence Rider process, and the generated text never contains a value.
Only `variables` handles values itself, because it must pass each one to Forge
as an argument. Tunnel's script uses Forge's local prefixed environment instead
of changing the remote variable store; printing it reads only names from
SecretSpec. One resolution can serve these destinations without pretending they
share a lifecycle. See the [tested versions and
evidence](../../specs/validation.md).

## Related material

- [What Fence Rider is for, and where it stops](scope-and-boundaries.md)
- [Variable compatibility reference](../reference/reference.md)
- [SecretSpec scopes](https://secretspec.dev/concepts/scopes/)
- [Forge manifest variables][manifest]
- [Forge environments and runtime variables][environments]

[manifest]: https://developer.atlassian.com/platform/forge/manifest-reference/environment/
[environments]: https://developer.atlassian.com/platform/forge/environments/
