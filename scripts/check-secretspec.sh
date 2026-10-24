#!/usr/bin/env bash
# Exercise the documented workflow with synthetic values and a fake Forge CLI.
set -euo pipefail
set +x
umask 077

root=$(cd "$(dirname "$0")/.." && pwd)
fixture=$(mktemp -d "$root/tmp_rovo_secretspec.XXXXXX")
trap 'rm -rf "$fixture"' EXIT
mkdir -p "$fixture/home/.config/secretspec" "$fixture/bin" "$fixture/app"
export HOME="$fixture/home" XDG_CONFIG_HOME="$fixture/home/.config"
export XDG_DATA_HOME="$fixture/home/.local/share" XDG_CACHE_HOME="$fixture/home/.cache"
export XDG_STATE_HOME="$fixture/home/.local/state"
# The smoke test needs no OpenSSL config; avoid the host's unrelated provider setup.
export OPENSSL_CONF=/dev/null
unset SECRETSPEC_PROVIDER SECRETSPEC_PROFILE SECRETSPEC_SCOPE SECRETSPEC_FILE
unset FORGE_SITE FORGE_PRODUCT FORGE_ENVIRONMENT RPC_BEARER_SECRET

# The first TOML block is the app declaration readers copy from the guide.
awk '/^```toml$/ { block = 1; next } block && /^```$/ { exit } block { print }' \
  "$root/docs/how-to/configure-app-secrets.md" >"$fixture/app/secretspec.toml"
export SECRETSPEC_FILE="$fixture/app/secretspec.toml"

# Replace the real secret backend only in this disposable user configuration.
secretspec config global provider add user_dotenv \
  'dotenv:~/.config/secretspec/user.env' >/dev/null
secretspec config global provider add app_secrets \
  "dotenv:$fixture/app/synthetic.env" >/dev/null
secretspec config global init --provider dotenv --profile default >/dev/null
secretspec set --provider user_dotenv --profile default FORGE_SITE example.atlassian.net >/dev/null
secretspec set --provider user_dotenv --profile default FORGE_PRODUCT jira >/dev/null
secretspec set --provider user_dotenv --profile default FORGE_ENVIRONMENT development >/dev/null

# Missing required runtime credentials must fail without printing a value.
if secretspec check --scope '' --no-prompt >/dev/null 2>&1; then
  echo 'FAIL: a missing required runtime credential passed validation' >&2
  exit 1
fi

# This is the same stdin-only generation pipeline used in the guide.
openssl rand -hex 32 | tr -d '\n' |
  secretspec set --provider app_secrets --profile default \
    --from-file - RPC_BEARER_SECRET >/dev/null
secretspec check --scope '' --explain >/dev/null
secretspec check --scope runtime --json >/dev/null
# The injected variables must expand in the child, not in this script.
# shellcheck disable=SC2016
secretspec run --scope '' -- sh -c '
  test "$FORGE_SITE" = example.atlassian.net &&
  test "$FORGE_PRODUCT" = jira &&
  test "$FORGE_ENVIRONMENT" = development &&
  test "${#RPC_BEARER_SECRET}" -eq 64
'

# No executable in this check can contact Forge: every Forge call is intercepted.
cat >"$fixture/bin/forge" <<'SH'
#!/bin/sh
set -eu
if [ "${1-}" = --version ]; then echo 14.2.0; exit 0; fi
test "$FORGE_SITE" = example.atlassian.net
test "$FORGE_PRODUCT" = jira
test "$FORGE_ENVIRONMENT" = development
test "${#RPC_BEARER_SECRET}" -eq 64
case "$1" in
  lint) test "$#" -eq 1 ;;
  deploy) test "$*" = 'deploy --environment development --non-interactive --environment development' ;;
  install)
    case "$*" in
      'install --environment development --site example.atlassian.net --product jira --confirm-scopes --non-interactive') ;;
      'install --environment development --site example.atlassian.net --product jira --upgrade --confirm-scopes --non-interactive') ;;
      *) exit 1 ;;
    esac
    ;;
  uninstall) test "$*" = 'uninstall --environment development --site example.atlassian.net --product jira' ;;
  variables)
    test "$#" -eq 7
    test "$2" = set
    test "$3" = --encrypt && test "$4" = --environment
    test "$5" = development && test "$6" = RPC_BEARER_SECRET
    test "$7" = "$RPC_BEARER_SECRET"
    ;;
  *) echo 'FAIL: unexpected Forge command' >&2; exit 1 ;;
esac
printf '%s\n' "$1" >> "$TEST_FORGE_CALLS"
SH
chmod +x "$fixture/bin/forge"
export PATH="$fixture/bin:$PATH" TEST_FORGE_CALLS="$fixture/calls"
# Run copies of the actual package scripts away from the real project's dotenv.
cp "$root/package.json" "$root/manifest.yml" "$fixture/app/"
ln -s "$root/node_modules" "$fixture/app/node_modules"
cd "$fixture/app"
bun --no-env-file run fence-rider doctor --resolve >/dev/null
bun --no-env-file run lint:forge >/dev/null
bun --no-env-file run forge:variables:set --environment development >/dev/null
bun --no-env-file run forge:deploy --environment development >/dev/null
bun --no-env-file run forge:install >/dev/null
bun --no-env-file run forge:upgrade >/dev/null
bun --no-env-file run forge:uninstall >/dev/null
test "$(cat "$fixture/calls")" = "$(printf 'lint\nvariables\ndeploy\ninstall\ninstall\nuninstall')"
rm "$fixture/app/synthetic.env"
if bun --no-env-file run lint:forge >/dev/null 2>&1; then
  echo 'FAIL: missing runtime credential did not block configured lint' >&2
  exit 1
fi
test "$(wc -l <"$fixture/calls" | tr -d ' ')" -eq 6
echo 'PASS: shared controls, isolated app secret, fail-fast validation, stdin generation, injection and package scripts (fake Forge only)'
