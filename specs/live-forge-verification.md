# Live Forge verification

Status: blocked. No authorization for a disposable app has been supplied.

## Current state

Every workflow is implemented and tested locally against real SecretSpec 0.21.1
and controlled Forge executables for Forge CLI 14.2.0
([tested versions and evidence](validation.md)).
Controlled executables prove argument boundaries, ordering, environments, and
cleanup. They cannot prove what Forge's servers or runtime do.

## Gap

| Claim to confirm | Why local evidence cannot show it |
| --- | --- |
| Manifest substitution works for supported manifest fields | Forge parses the manifest, not the fake |
| `variables` stores values encrypted, and a later deployment activates them in the same environment | Needs server metadata and a runtime comparison |
| `install` and `install --upgrade` apply profile targets and consent options | Needs a real site, product, and consent flow |
| `tunnel` delivers `FORGE_USER_VAR_<name>` values to a connected local runtime | Needs an invoked installed app |
| `uninstall` removes only the matched disposable installation | Needs a real removal; a confirmation prompt is not guaranteed |
| Positional edge-case values (multiline, quotes) are accepted by Forge | Needs server-side acceptance |
| Upload and deployment hit the same named environment | Needs environment identity from Forge |

## Scope and non-goals

- One disposable app, site, and development environment, named in advance.
- Synthetic variable names and values only, with a boolean-only runtime
  observation. Plaintext must not appear in output or logs.
- No substitute target: never an existing production installation.
- Not a release certification of other Forge versions, providers, or platforms
  (see [tool compatibility](tool-compatibility-and-delivery.md)).

## Acceptance

| ID | Result |
| --- | --- |
| LV-01 | A manifest field using a synthetic input resolves it during real lint and deploy. |
| LV-02 | A synthetic runtime variable is stored encrypted for the named environment, and after deployment a runtime check reports a match without printing the value. |
| LV-03 | Install and upgrade target the named site, product, and environment; consent options behave as passed. |
| LV-04 | A running tunnel's local runtime receives the runtime members and not unselected values. |
| LV-05 | Uninstall removes only the disposable installation, and cleanup leaves no remote state. |
| LV-06 | A multiline and a quoted value survive upload and read back equal. |

## Authorization checklist

Live verification requires separate authorization before any operation:

1. Name the disposable app ID, site, product, and development environment.
2. Name each synthetic variable and the permitted upload, deploy, install,
   upgrade, tunnel, and uninstall operations.
3. Specify allowed observations: a boolean-only runtime comparison and
   encryption metadata, never a plaintext value or credential-bearing log.
4. Agree on cleanup, including remote variables, deployments, and installations.
5. Record the Forge CLI version and redact outputs before attaching evidence.

Approval of this specification or a documentation edit does not authorize a
live run. Stop if no named target and cleanup scope have been approved.

## Evidence rules

- Authorization follows the checklist above; it is not inferred from a package
  script's consent or non-interactive flags.
- Record Forge CLI version and redacted outcomes. Mark each LV row passed,
  failed, or blocked; update the evidence map and delete this spec's rows as
  they pass.
- A failed observation returns the affected documented contract for review
  rather than being worked around.
