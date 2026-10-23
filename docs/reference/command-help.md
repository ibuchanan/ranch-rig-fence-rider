# Command help

This page embeds Commander-generated `fence-rider help <command>` output.
Command and option declarations live in `src/cli.ts`; workflow notes live beside
the implementations. Tests detect drift from this generated reference.

## deploy

```text
Usage: fence-rider deploy [options] [-- <forge-args...>]

Print a deployment script

Options:
  -e, --environment <target>  Override FORGE_ENVIRONMENT (default: development)
  -h, --help                  display help for command

Prints a shell script that runs forge deploy under secretspec run with the whole profile.
Run it from a package script: cmd=$(fence-rider deploy) && sh -c "$cmd" sh
Target: explicit option, resolved FORGE_ENVIRONMENT, then development. A target must be non-empty and not start with a dash.
Put Forge arguments after --; they may override the injected target. Arguments appended after sh are passed too.
Deploy never uploads runtime variables; run fence-rider variables first when they change.
Forge input/output is inherited, live and unredacted. SecretSpec and Forge must be installed on PATH and authenticated separately.
```

## variables

```text
Usage: fence-rider variables [options]

Upload encrypted runtime variables

Options:
  -e, --environment <target>  Override FORGE_ENVIRONMENT (default: development)
  -h, --help                  display help for command

Encrypts and uploads each runtime-scope value with forge variables set --encrypt, so run it when the variables change; deploy never uploads.
Target: explicit option, resolved FORGE_ENVIRONMENT, then development.
Resolves the whole profile once and checks optional manifest declarations before the first upload. Local controls, empty values and values starting with a dash are refused.
Forge options are not accepted. Uploads are not rolled back; a failure after the first may leave remote variables changed.
SecretSpec and Forge must be installed on PATH and authenticated separately.
```

## lint

```text
Usage: fence-rider lint [options] [-- <forge-args...>]

Print a configured lint script

Options:
  -h, --help  display help for command

Prints a shell script that runs forge lint under secretspec run with the whole active profile.
Run it from a package script: cmd=$(fence-rider lint) && sh -c "$cmd" sh
Put Forge arguments after --. Arguments appended by a script runner after sh are passed too.
Forge stdin is inherited; stdout/stderr stream live and unredacted. Upstream output may expose values.
No targets are injected and no runtime variables are uploaded. Unresolved optional declarations leave ambient values visible to Forge.
SecretSpec and Forge CLI must be installed on PATH and authenticated separately; run fence-rider doctor to check them.
```

## install

```text
Usage: fence-rider install [options] [-- <forge-args...>]

Print an installation script

Options:
  -h, --help  display help for command

Prints a shell script that runs forge install under secretspec run with the whole profile.
Run it from a package script: cmd=$(fence-rider install) && sh -c "$cmd" sh
Profile defaults: FORGE_SITE / FORGE_PRODUCT / FORGE_ENVIRONMENT. Site and product are required; only environment falls back to development. Defaults must be non-empty and not start with a dash.
Put Forge arguments after --; they can override profile-derived selectors. Arguments appended after sh are passed too. Unresolved optional declarations leave ambient values visible to Forge.
Use -- --upgrade [all|code], --confirm-scopes and --non-interactive only when intended. No consent or non-interactive flags are injected.
No runtime uploads, variable deletion or deployment. Forge input/output is inherited, live and unredacted. SecretSpec and Forge must be installed on PATH and authenticated separately.
```

## uninstall

```text
Usage: fence-rider uninstall [options] [-- <forge-args...>]

Print an uninstall script

Options:
  -h, --help  display help for command

Prints a shell script that runs forge uninstall under secretspec run with the whole profile.
Run it from a package script: cmd=$(fence-rider uninstall) && sh -c "$cmd" sh
Profile defaults: FORGE_SITE / FORGE_PRODUCT / FORGE_ENVIRONMENT. Site and product are required; only environment falls back to development. Defaults must be non-empty and not start with a dash.
Put Forge arguments after --; they can override profile-derived selectors. Arguments appended after sh are passed too. Unresolved optional declarations leave ambient values visible to Forge.
Uninstall changes remote installation state; Forge owns interaction and does not support --non-interactive in 14.2.0. No upgrade, consent or confirmation flags are injected.
No runtime uploads, variable deletion or deployment. Forge input/output is inherited, live and unredacted. SecretSpec and Forge must be installed on PATH and authenticated separately.
```

## tunnel

```text
Usage: fence-rider tunnel [options] [-- <forge-args...>]

Print a development tunnel script

Options:
  -e, --environment <target>  Override FORGE_ENVIRONMENT (default: development)
  -h, --help                  display help for command

Prints a shell script that runs forge tunnel under secretspec run, with the whole profile resolved into its environment. Run it from a package script:
  cmd=$(fence-rider tunnel) && sh -c "$cmd" sh
Put Forge arguments after --; they may override the injected target. Arguments appended after sh are passed too.
Target: explicit option, resolved FORGE_ENVIRONMENT, then development. Forge supports tunnels only for development environments.
Asks SecretSpec for the declared names and the runtime scope's members (never values) while printing. Runtime members alone map to FORGE_USER_VAR_<name>; empty strings are supported. Ambient prefixed values are removed; declarations using that reserved prefix are rejected.
Forge input/output streams live and unredacted; app logs may expose values. -h shows wrapper help; use -- -h HOST for Forge's debug host.
No remote variable uploads/deletion, deployment or installation. SecretSpec and Forge must be installed on PATH and authenticated separately.
```

## doctor

```text
Usage: fence-rider doctor [options]

Check installed tools and configuration

Options:
  --resolve   Check required values resolve (may access providers) (default:
              false)
  -h, --help  display help for command

Report the SecretSpec and Forge CLI versions on PATH against the lowest supported and highest tested versions.
Reads SecretSpec's declared schema, which carries no values, and applies the rules variables applies when it resolves the profile: every name is letters, digits and underscores and does not start with a digit, and every declaration is a string or string-or-null. Asks SecretSpec (value-free) for the manifest scope's members, including a scope inherited through project.extends, and checks that manifest.yml declares them. Likewise asks for the runtime scope's members and reports what variables would upload: an undefined or empty scope is a warning, a local control (FORGE_ENVIRONMENT, FORGE_SITE, FORGE_PRODUCT) among them is a failure. Warns, by name only, about values already exported in the shell that can change a generated command: declared keys and local controls, which secretspec run leaves in place for unresolved optional declarations, and FORGE_USER_VAR_ names that tunnel cannot clear; this is advisory and never prints a value. Also reads the SecretSpec file (SECRETSPEC_FILE, else ./secretspec.toml) only to warn about scopes Fence Rider never reads.
--resolve additionally asks SecretSpec (`check --json`, value-free) whether every required value resolves, and names the ones that do not. Resolving reads the provider, so it may prompt for vault authentication and add audit entries; without the flag doctor makes no such call. An unresolved optional value is not a failure.
Exits 1 when a tool is missing, unreadable or older than supported, the schema has an unsupported name or type, a manifest scope member is not declared in manifest.yml, a runtime scope member is a local control, or with --resolve a required value does not resolve; a newer version, an unused scope, an empty runtime scope or ambient shadowing is only a warning.
Other commands never pre-check versions: a changed tool contract surfaces as that command's failure.
```
