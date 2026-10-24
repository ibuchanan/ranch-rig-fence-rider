#!/usr/bin/env bash
# Exercise the provider guide and canonical package scripts without real credentials.
set -euo pipefail
set +x
umask 077

root=$(cd "$(dirname "$0")/.." && pwd)
fixture=$(mktemp -d "$root/tmp_rovo_secretspec.XXXXXX")
trap 'rm -rf "$fixture"' EXIT
mkdir -p "$fixture/home/.config/secretspec" "$fixture/bin" "$fixture/app"
export HOME="$fixture/home" XDG_CONFIG_HOME="$fixture/home/.config"
export XDG_DATA_HOME="$fixture/home/.local/share" XDG_CACHE_HOME="$fixture/home/.cache"
export XDG_STATE_HOME="$fixture/home/.local/state" TMPDIR="$fixture"
export OPENSSL_CONF=/dev/null
# Keep every SecretSpec selection local to this disposable fixture.
for name in ${!SECRETSPEC_@}; do unset "$name"; done
unset FORGE_SITE FORGE_PRODUCT FORGE_ENVIRONMENT APP_BEARER_TOKEN
export SECRETSPEC_REASON='Validate synthetic Fence Rider documentation fixtures'
export SECRETSPEC_PROFILE=default

# Use the app declaration readers copy, not a parallel specification.
awk '/^```toml$/ { block = 1; next } block && /^```$/ { exit } block { print }' \
  "$root/docs/how-to/configure-app-secrets.md" >"$fixture/app/secretspec.toml"
export SECRETSPEC_FILE="$fixture/app/secretspec.toml"
cp "$root/docs/examples/package.json" "$root/docs/examples/manifest.yml" "$fixture/app/"
# The declaration has no manifest scope; the example manifest is only a test fragment.
cat >"$fixture/bin/fence-rider" <<'SH'
#!/bin/sh
exec bun --no-env-file run "$TEST_FENCE_RIDER_SOURCE" "$@"
SH
export TEST_FENCE_RIDER_SOURCE="$root/src/index.ts"

# Every Forge call is intercepted, including diagnostics. No real Forge is needed.
cat >"$fixture/bin/forge" <<'SH'
#!/bin/sh
set -eu
if [ "${1-}" = --version ]; then echo 14.2.0; exit 0; fi
test "$FORGE_SITE" = example.atlassian.net
test "$FORGE_PRODUCT" = jira
test "$FORGE_ENVIRONMENT" = development
test "${#APP_BEARER_TOKEN}" -eq 64
case "$1" in
  lint) test "$#" -eq 1 ;;
  deploy)
    case "$*" in
      'deploy --environment development --non-interactive --approve MAJOR_VERSION_RULE' | \
      'deploy --environment development --non-interactive --approve MAJOR_VERSION_RULE --environment development') ;;
      *) exit 1 ;;
    esac ;;
  install)
    case "$*" in
      'install --environment development --site example.atlassian.net --product jira --confirm-scopes --non-interactive' | \
      'install --environment development --site example.atlassian.net --product jira --upgrade --confirm-scopes --non-interactive') ;;
      *) exit 1 ;;
    esac ;;
  uninstall)
    test "$*" = 'uninstall --environment development --site example.atlassian.net --product jira' ;;
  tunnel)
    test "$*" = 'tunnel --environment development --environment development'
    test "$FORGE_USER_VAR_APP_BEARER_TOKEN" = "$APP_BEARER_TOKEN" ;;
  variables)
    test "$#" -eq 7
    test "$2" = set && test "$3" = --encrypt && test "$4" = --environment
    test "$5" = development && test "$6" = APP_BEARER_TOKEN
    test "$7" = "$APP_BEARER_TOKEN" ;;
  *) echo 'FAIL: unexpected Forge command' >&2; exit 1 ;;
esac
printf '%s\n' "$1" >> "$TEST_FORGE_CALLS"
SH
chmod +x "$fixture/bin/forge" "$fixture/bin/fence-rider"
export PATH="$fixture/bin:$PATH" TEST_FORGE_CALLS="$fixture/calls"
cd "$fixture/app"

# Synthetic test exception: dotenv here proves routing, not secret-backend safety.
# Never use this project_secrets binding for real credentials.
secretspec config global provider add shared_config \
  'dotenv:~/.config/secretspec/user.env' >/dev/null
secretspec config global provider add project_secrets \
  "dotenv:$fixture/app/synthetic.env" >/dev/null
secretspec config global init --provider dotenv --profile default >/dev/null
secretspec set --provider shared_config --profile default FORGE_SITE example.atlassian.net >/dev/null
secretspec set --provider shared_config --profile default FORGE_PRODUCT jira >/dev/null
secretspec set --provider shared_config --profile default FORGE_ENVIRONMENT development >/dev/null

if secretspec check --scope '' --no-prompt >/dev/null 2>&1; then
  echo 'FAIL: a missing required runtime credential passed validation' >&2
  exit 1
fi

# Same stdin-only generation pipeline as the guide, never a real credential.
openssl rand -hex 32 | tr -d '\n' |
  secretspec set --provider project_secrets --profile default \
    --from-file - APP_BEARER_TOKEN >/dev/null
secretspec check --scope '' --explain >/dev/null
secretspec check --scope runtime --json >/dev/null
# shellcheck disable=SC2016
secretspec run --scope '' -- sh -c '
  test "$FORGE_SITE" = example.atlassian.net &&
  test "$FORGE_PRODUCT" = jira &&
  test "$FORGE_ENVIRONMENT" = development &&
  test "${#APP_BEARER_TOKEN}" -eq 64
'

bun --no-env-file run fence-rider doctor --resolve >/dev/null
bun --no-env-file run lint:forge >/dev/null
bun --no-env-file run variables --environment development >/dev/null
bun --no-env-file run deploy --environment development >/dev/null
bun --no-env-file run install:forge >/dev/null
bun --no-env-file run upgrade:forge >/dev/null
bun --no-env-file run uninstall:forge >/dev/null
bun --no-env-file run tunnel --environment development >/dev/null
bun --no-env-file run release >/dev/null
expected=$(printf 'lint\nvariables\ndeploy\ninstall\ninstall\nuninstall\ntunnel\nvariables\ndeploy')
actual=$(<"$fixture/calls")
test "$actual" = "$expected"

rm "$fixture/app/synthetic.env"
for script in lint:forge release; do
  if bun --no-env-file run "$script" >/dev/null 2>&1; then
    echo "FAIL: missing runtime credential did not block $script" >&2
    exit 1
  fi
done
actual=$(<"$fixture/calls")
test "$actual" = "$expected"
echo 'PASS: provider setup, stdin generation, injection, all configured workflows and fail-fast checks (synthetic values; fake Forge only)'
