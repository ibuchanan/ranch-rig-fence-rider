# Tested versions and evidence

This specification-to-code evidence record maps the acceptance scenarios to
working code and records what the validation does and does not establish. It
is maintainer evidence, not a consumer command reference. Scenario IDs are
defined in the [acceptance criteria](../docs/reference/acceptance-criteria.md);
the tests under [`tests/`](../tests/) provide the evidence. Check execution is
described in the [development runbook](../DEVELOPMENT.md#runbook).

## Version baseline

| Component  | Tested version | Evidence                                                                                                  |
| ---------- | -------------- | --------------------------------------------------------------------------------------------------------- |
| Bun        | 1.4.3, macOS   | Compiled CLI, TOML/YAML, subprocess and POSIX cleanup checks                                              |
| SecretSpec | 0.21.1         | Native schema, scope check and full-profile dotenv export through the compiled CLI; synthetic values only |
| Forge CLI  | 14.2.0         | Installed help, published source and official documentation; controlled delegation only                   |
| Commander  | 15.0.0         | Wrapper parsing, generated help, compiled and installed-package execution under Bun                       |
| Fallow     | 3.34.1         | The repository's lint gate                                                                                |

These are observed versions, not a supported range. `fence-rider doctor`
compares installed tools with the lowest supported and highest tested release
in `src/doctor.ts`; the lowest versions are inferred from the features used, not
exercised. Only the dotenv provider is exercised.

## Evidence levels

| Level      | What ran                                                                                                | What it cannot show                                                                                        |
| ---------- | ------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Controlled | The compiled CLI with recording or failing Forge and SecretSpec executables on `PATH`                   | What a real tool does                                                                                      |
| Native     | Real SecretSpec on `PATH` with synthetic dotenv values and defaults, including installed-package checks | Other providers, SDK features, cross-file `project.extends`                                                |
| Interface  | Forge help, published source and documentation                                                          | Server acceptance or runtime behavior; running Forge's help under Bun only warns about its Node.js runtime |
| Live       | A separately authorized Forge app and service                                                           | Blocked; see below                                                                                         |

The native suite also runs `scripts/check-secretspec.sh`, which reads the
provider guide's app declaration and the canonical package scripts. It checks
shared controls, stdin-only synthetic credential generation, all seven
workflows, combined release, and fail-fast behavior with real SecretSpec and
fake Forge. It substitutes dotenv for the secret backend: this is not keyring
or vault evidence. Relative file links and cross-file Markdown heading anchors
are checked offline by `markdownlint-rule-relative-links` through `lint:docs`;
markdownlint's MD051 checks same-document fragments. A disposable migration
probe confirmed missing-file and missing-heading failures, valid reference links,
spaced paths, duplicate headings, and ignored fenced examples. The lint glob
excludes `.agents/`, `.claude/skills/`, and the root `SECURITY.md`,
`CODE_OF_CONDUCT.md`, and `CONTRIBUTING.md` templates. External URLs are not
validated.

Native tests skip when SecretSpec is absent, and POSIX interruption tests skip
on Windows; a skip is not evidence. Controlled Forge executables do not
establish server acceptance, encryption at rest or runtime activation.

## SecretSpec 0.21.1 source findings

From the published `secretspec@0.21.1` package, its configuration loader and its
regression tests; the upstream tests were not executed.

| Finding                 | Detail                                                                                                                                                                                       |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SDK scope metadata      | `Builder`, `Resolved` and `Report` expose only the selected scope, never scope lists or merged declarations, so the SDK cannot supply membership                                             |
| SDK `withNoValues()`    | Omits values but does not guarantee avoiding provider I/O                                                                                                                                    |
| SDK `setAsEnv()`        | Skips null values without clearing existing environment entries                                                                                                                              |
| SDK `as_path` values    | Secret-bearing temporary files with caller-owned disposal                                                                                                                                    |
| SDK runtime             | Embeds a native addon; Bun compatibility not shown                                                                                                                                           |
| Resolver protocol       | `secretspec.resolver/1` resolves exact names only; no whole-profile or manifest queries                                                                                                      |
| JSON export and schema  | Export returns values without membership; schema returns names, types and requiredness without scope lists                                                                                   |
| `project.extends` order | Depth-first in listed order; ancestors first, then overlays least to most specific, root last; shared ancestors once by canonical path; a cycle fails                                        |
| `extends` paths         | `.toml` entries are files, others are directories holding `secretspec.toml`; relative paths resolve from the referring file's lexical location; missing files and unsupported revisions fail |
| Scope removal           | No disable or delete marker found in scope overlays                                                                                                                                          |
| `secretspec load`       | Not a command in 0.21.1                                                                                                                                                                      |
| `secretspec check`      | May prompt or set missing values; a check followed by an export is not one coherent resolution                                                                                               |

## Live Forge verification: blocked

No Forge command has been run against a live app, and no app, environment,
synthetic variable, deployment or cleanup scope has been authorized. Missing
evidence:

- Server-side acceptance and encrypted storage of synthetic variables in a named
  disposable app and environment.
- Matching upload and deployment target identity.
- Runtime use of a changed value after deployment, under Forge's activation
  lifecycle.
- Manifest substitution, install, upgrade, tunnel receipt and uninstall on a
  disposable app.

Local results are therefore not a release-readiness or live-compatibility pass.
The authorization checklist and remaining acceptance work are in
[live Forge verification](live-forge-verification.md#authorization-checklist).
