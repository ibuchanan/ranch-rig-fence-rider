# Command help

This page embeds the output of `fence-rider help <command>` verbatim. The
command table in `src/commands.ts` is the only place usage text is written;
a test fails when this page drifts from it. Other pages link here instead of
restating usage.

## deploy

```text
Usage: fence-rider deploy [-e, --environment TARGET] [Forge options]
Prints a shell script that runs forge deploy under secretspec run, with the whole profile resolved into its environment. Run it from a package script:
  cmd=$(fence-rider deploy) && sh -c "$cmd" sh
Options given here are embedded in the script; options a script runner appends after `sh` are passed too.
Target: explicit option, resolved FORGE_ENVIRONMENT, then development; it must not be empty or start with a dash.
Deploy does not upload variables, as forge deploy does not; run fence-rider variables first when they change.
Forge input/output is inherited, live and unredacted. SecretSpec and Forge must be installed on PATH and authenticated separately.
```

## variables

```text
Usage: fence-rider variables [-e, --environment TARGET]
Encrypts and uploads each runtime-scope value with forge variables set --encrypt, so run it when the variables change; deploy never uploads.
Target: explicit option, resolved FORGE_ENVIRONMENT, then development.
Resolves the whole profile once and checks optional manifest declarations before the first upload. Local controls, empty values and values starting with a dash are refused.
Forge options are not accepted. Uploads are not rolled back; a failure after the first may leave remote variables changed.
SecretSpec and Forge must be installed on PATH and authenticated separately.
```

## lint

```text
Usage: fence-rider lint [Forge options]
Prints a shell script that runs forge lint under secretspec run, with the whole active profile resolved into its environment. Run it from a package script:
  cmd=$(fence-rider lint) && sh -c "$cmd" sh
Options given here are embedded in the script; options a script runner appends after `sh` are passed too.
Forge stdin is inherited; stdout/stderr stream live and unredacted. Upstream output may expose values.
No target flags are injected and no runtime variables are uploaded.
Fence Rider does not validate values, and an exported variable the profile does not resolve (or declare) stays visible to Forge.
SecretSpec and Forge must be installed on PATH and authenticated separately; run fence-rider doctor to check them.
```

## install

```text
Usage: fence-rider install [Forge options]
Prints a shell script that runs forge install under secretspec run, with the whole profile resolved into its environment. Run it from a package script:
  cmd=$(fence-rider install) && sh -c "$cmd" sh
Options given here are embedded in the script; options a script runner appends after `sh` are passed too.
Targets come from FORGE_SITE / FORGE_PRODUCT / FORGE_ENVIRONMENT; only environment falls back to development.
Site and product are required, and no target may be empty or start with a dash; Forge validates their values.
The target options -e/--environment, -s/--site and -p/--product are not accepted; for other targets run secretspec and forge directly.
Fence Rider does not validate values, and an exported variable the profile does not resolve (or declare) stays visible to Forge.
Use --upgrade [all|code], --confirm-scopes and --non-interactive only when intended.
No runtime uploads, variable deletion or deployment.
Forge input/output is inherited, live and unredacted. SecretSpec and Forge must be installed on PATH and authenticated separately.
```

## uninstall

```text
Usage: fence-rider uninstall [Forge options]
Prints a shell script that runs forge uninstall under secretspec run, with the whole profile resolved into its environment. Run it from a package script:
  cmd=$(fence-rider uninstall) && sh -c "$cmd" sh
Options given here are embedded in the script; options a script runner appends after `sh` are passed too.
Targets come from FORGE_SITE / FORGE_PRODUCT / FORGE_ENVIRONMENT; only environment falls back to development.
Site and product are required, and no target may be empty or start with a dash; Forge validates their values.
The target options -e/--environment, -s/--site and -p/--product are not accepted; for other targets run secretspec and forge directly.
Fence Rider does not validate values, and an exported variable the profile does not resolve (or declare) stays visible to Forge.
Uninstall changes remote installation state; Forge owns remaining interaction. Forge 14.2.0 does not support --non-interactive. No upgrade, consent, approval or confirmation switches are injected.
No runtime uploads, variable deletion or deployment.
Forge input/output is inherited, live and unredacted. SecretSpec and Forge must be installed on PATH and authenticated separately.
```

## tunnel

```text
Usage: fence-rider tunnel [-e, --environment TARGET] [Forge options]
Prints a shell script that runs forge tunnel under secretspec run, with the whole profile resolved into its environment. Run it from a package script:
  cmd=$(fence-rider tunnel) && sh -c "$cmd" sh
Options given here are embedded in the script; options a script runner appends after `sh` are passed too.
Target: explicit option, resolved FORGE_ENVIRONMENT, then development. Forge supports tunnels only for development environments.
Asks SecretSpec for the declared names and the runtime scope's members (never values) while printing. Runtime members alone map to FORGE_USER_VAR_<name>; empty strings are supported. Ambient prefixed values are removed; declarations using that reserved prefix are rejected.
Forge input/output streams live and unredacted; app logs may expose values. -h is debug host, not help; use --help.
No remote variable uploads/deletion, deployment or installation. SecretSpec and Forge must be installed on PATH and authenticated separately.
```

## doctor

```text
Usage: fence-rider doctor
Report the SecretSpec and Forge CLI versions on PATH against the lowest supported and highest tested versions.
Also reads the SecretSpec file (SECRETSPEC_FILE, else ./secretspec.toml): it warns about scopes Fence Rider never reads, and when a manifest scope exists it asks SecretSpec (value-free) for its members and checks that manifest.yml declares them.
Exits 1 when a tool is missing, unreadable or older than supported, or a manifest scope member is not declared in manifest.yml; a newer version or an unused scope is only a warning.
Other commands never pre-check versions: a changed tool contract surfaces as that command's failure.
```
