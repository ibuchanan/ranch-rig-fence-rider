# Command help

This page embeds the output of `fence-rider help <command>` verbatim. The
command table in `src/commands.ts` is the only place usage text is written;
a test fails when this page drifts from it. Other pages link here instead of
restating usage.

## deploy

```text
Usage: fence-rider deploy [-e, --environment TARGET] [Forge options]
Target: explicit option, resolved FORGE_ENVIRONMENT, then development.
Conflicting resolved names fail even with an explicit target.
SecretSpec and Forge must be installed on PATH and authenticated separately.
```

## lint

```text
Usage: fence-rider lint [Forge options]
Resolve the whole active profile, check optional manifest metadata, then lint.
Forge stdin is inherited; stdout/stderr stream live and unredacted. Upstream output may expose values.
No target flags are injected and no runtime variables are uploaded.
SecretSpec and Forge must be installed on PATH and authenticated separately.
```

## install

```text
Usage: fence-rider install [-e, --environment TARGET] [-s, --site URL] [-p, --product PRODUCT] [Forge options]
Targets: explicit option, then resolved FORGE_SITE / FORGE_PRODUCT / FORGE_ENVIRONMENT. Only environment falls back to development.
Site and product are required; Forge validates their values.
The whole profile must resolve, even when options override its values.
Use --upgrade [all|code], --confirm-scopes and --non-interactive only when intended.
No runtime uploads, variable deletion or deployment.
Forge input/output is inherited, live and unredacted. SecretSpec and Forge must be installed on PATH and authenticated separately.
```

## uninstall

```text
Usage: fence-rider uninstall [-e, --environment TARGET] [-s, --site URL] [-p, --product PRODUCT] [Forge options]
Targets: explicit option, then resolved FORGE_SITE / FORGE_PRODUCT / FORGE_ENVIRONMENT. Only environment falls back to development.
Site and product are required; Forge validates their values.
The whole profile must resolve, even when options override its values.
Uninstall changes remote installation state; Forge owns remaining interaction. Forge 14.2.0 does not support --non-interactive. No upgrade, consent, approval or confirmation switches are injected.
No runtime uploads, variable deletion or deployment.
Forge input/output is inherited, live and unredacted. SecretSpec and Forge must be installed on PATH and authenticated separately.
```

## tunnel

```text
Usage: fence-rider tunnel [-e, --environment TARGET] [Forge options]
Target: explicit option, resolved FORGE_ENVIRONMENT, then development. Forge supports tunnels only for development environments.
Resolve the whole profile once; check optional manifest declarations. Runtime members alone map to FORGE_USER_VAR_<name>; empty strings are supported. Ambient prefixed values are removed; declarations using that reserved prefix are rejected.
Forge input/output streams live and unredacted; app logs may expose values. -h is debug host, not help; use --help.
No remote variable uploads/deletion, deployment or installation. SecretSpec and Forge must be installed on PATH and authenticated separately.
```

## doctor

```text
Usage: fence-rider doctor
Report the SecretSpec and Forge CLI versions on PATH against the lowest supported and highest tested versions.
Also checks the SecretSpec file (SECRETSPEC_FILE, else ./secretspec.toml) and warns about scopes Fence Rider never reads.
Exits 1 when a tool is missing, unreadable or older than supported, or the scopes are malformed; a newer version or an unused scope is only a warning.
Other commands never pre-check versions: a changed tool contract surfaces as that command's failure.
```
