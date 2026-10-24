# Why SecretSpec and Fence Rider belong together

## From SSH keys to application credentials

Atlassian takes our Trust obligations with customers seriously.
That's why we implement _internal_ policies like "no secrets on disk".
That creates a constraint on even the public, OSS Forge repos we create.
It's not enough that Git ignores files like `.env`.
We take measures to make sure secrets,
wherever they live,
are never pushed to Git.
That way,
a process like an AI coding agent with access to the filesystem
cannot copy a reusable private credential.
For sample Forge apps,
that means we can't build & test apps that would take the easy route of a `.env` file.

This risk isn't new in the age of AI coding agents,
but they have amplified the risks.
AI coding agents routinely search files and collect context.
A `.env` file can be read by a broad search,
a debugging command,
or a tool that ignores Git's ignore rules.
An instruction saying "do not read `.env`" is not an access control!
Moving the file outside the repository reduces accidental discovery
but does not protect it from a process with access to that directory.

That creates a design discipline
that also helps consumers of Forge apps.
We build and test without needing `.env` files,
so that you can also keep your secrets safe.
And, to the extent possible, out of:

- the repo, including `.env` files
- home directories
- shell history
- generated configuration

That is a design principle for Fence Rider.

## SecretSpec to the rescue

There are many tools and practices
that can satisfy the constraints.
What makes a sample Forge app tricky is
that what works for the authors
might not work for the consumers.
[SecretSpec](https://secretspec.dev/)
lets the repository describe required variable names
without storing their values.
Each operator binds those declarations to an approved provider,
then SecretSpec injects values into the process that needs them.
That removes the need to materialize an application credential as a plaintext project file.

For example,
Atlassians use their perferred secrets management tooling,
write the `secretspec.toml` to make it clear what variables are needed,
and consumers can decide how to store & recall those secrets.
Some consumers may be willing to accept the trade-offs of the `.env` file;
so be it, SecretSpec supports that.
Or, developers can decide to wire-up their own secrets management tooling.

To be clear,
this is just exposure reduction for secrets,
not an agent sandbox.
A coding agent that can run arbitrary commands as the user
can also invoke SecretSpec or inspect permitted processes.
Provider approval prompts,
short-lived credentials,
restricted agent permissions,
and operator-controlled secret access remain important.
Neither SecretSpec nor Fence Rider makes an authorized process unable
to reveal a secret once it has received it.

## Not every variable is a secret

Not only does SecretSpec decouple providers across different repository users,
it can also be used to keep different kinds of variables in different places.
For example, `FORGE_SITE`, `FORGE_PRODUCT`, and `FORGE_ENVIRONMENT` are common local target controls.
A user-global dotenv file can safely hold those non-secret settings,
and also make the same values available across repos.

## Binding SecretSpec to the Forge workflow

Forge needs configuration in distinct places:

- Local CLI commands need target settings (like the examples above).
- Manifest substitution may need build-time values.
- Deployed functions read Forge runtime variables, not the workstation's environment.

`secretspec run` handles local resolution and injection.
It does not decide which variables belong in Forge's runtime store,
upload them encrypted,
or coordinate Forge's environment flags.
Repeating that logic in every app's shell scripts makes it all-too-easy
to deploy to one environment and upload to another,
or to upload a local-only credential by mistake.

Fence Rider supplies that Forge-specific boundary.
It leaves provider syntax, profiles, inheritance,
and required-value rules to SecretSpec.
It interprets only the `runtime` and optional `manifest` scopes,
validates targets,
and provides commands used by package scripts.
Runtime uploads are explicit and encrypted.
(Indeed, even as `forge variables` defaults to unencrypted and provides choice,
Fence Rider chooses to encrypt all variables.
Let us know if you have a compelling case to support both.)
Deployment is separate,
so a normal code deployment need not rotate or upload credentials.

## Early failure

When using Fence Rider with configured package scripts,
the entire selected profile is resolved before Forge starts, including lint.
An unset required bearer secret therefore fails early
even when the immediate command would not consume it.
This deliberately checks readiness
rather than deferring discovery until deployment
or perhaps the first Forge function invocation.

## Caveats of this development tooling

Fence Rider is meant to be included as a `devDependency`.
It is not deployed in app code.
It does not provide any kind of proxy for Forge's access to environment variables through `process.env()`.
It neither authenticates the user nor grants deployment approval.
Forge output is not automatically redacted;
runtime uploads pass values to the Forge CLI
and are not atomic.
Application logging,
process access,
provider permissions,
and operator authorization remain separate responsibilities.

For setup,
see [user configuration](../how-to/configure-user-providers.md)
and [app configuration](../how-to/configure-app-secrets.md).
The [workflow guide](../how-to/use-forge-tooling.md) covers execution;
the [validation record](../reference/secretspec-validation.md)
distinguishes tested local behavior from unverified provider
and live Forge behavior.
