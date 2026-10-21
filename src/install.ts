import { type InstallCommand, parseInstallOptions } from "./install-plan";
import { emit, underSecretSpec } from "./shell";

const installPolicy = {
  install:
    "Use --upgrade [all|code], --confirm-scopes and --non-interactive only when intended.",
  uninstall:
    "Uninstall changes remote installation state; Forge owns remaining interaction. Forge 14.2.0 does not support --non-interactive. No upgrade, consent, approval or confirmation switches are injected.",
};

export function installUsage(command: InstallCommand) {
  return [
    `Usage: fence-rider ${command} [Forge options]`,
    `Prints a shell script that runs forge ${command} under secretspec run, with the whole profile resolved into its environment. Run it from a package script:`,
    `  cmd=$(fence-rider ${command}) && sh -c "$cmd" sh`,
    "Options given here are embedded in the script; options a script runner appends after `sh` are passed too.",
    "Targets come from FORGE_SITE / FORGE_PRODUCT / FORGE_ENVIRONMENT; only environment falls back to development.",
    "Site and product are required, and no target may be empty or start with a dash; Forge validates their values.",
    "The target options -e/--environment, -s/--site and -p/--product are ignored here, with a note on stderr, because the script injects the targets from the profile. Options a script runner appends after `sh` are not inspected and reach Forge as given, so they can duplicate the targets. For other targets run secretspec and forge directly.",
    "Fence Rider does not validate values, and an exported variable the profile does not resolve (or declare) stays visible to Forge.",
    installPolicy[command],
    "No runtime uploads, variable deletion or deployment.",
    "Forge input/output is inherited, live and unredacted. SecretSpec and Forge must be installed on PATH and authenticated separately.",
  ].join("\n");
}

/**
 * Runs inside `secretspec run`, which has put the resolved profile in the
 * environment. The command and forwarded arguments arrive as positional
 * parameters, so no caller-supplied text is ever interpolated into the script.
 */
const targetScript = `
command=$1; shift
environment=\${FORGE_ENVIRONMENT-development}
site=\${FORGE_SITE-}
product=\${FORGE_PRODUCT-}
for target in "$environment" "$site" "$product"; do
  case $target in
    ''|-*)
      echo "Fence Rider: the environment, site or product target is missing or invalid; set FORGE_SITE and FORGE_PRODUCT (FORGE_ENVIRONMENT defaults to development), none empty or starting with a dash" >&2
      exit 1 ;;
  esac
done
exec forge "$command" --environment "$environment" --site "$site" --product "$product" "$@"
`;

/** The script that runs one installation lifecycle command with the profile in its environment, or the usage text for help; throws on a refusal. */
export function installScript(args: string[], command: InstallCommand) {
  const { forwarded, help } = parseInstallOptions(args);
  if (help) return installUsage(command);
  return underSecretSpec([
    "sh",
    "-c",
    targetScript,
    "sh",
    command,
    ...forwarded,
  ]);
}

/** The names of the target options that installScript drops. */
export function ignoredTargetOptions(args: string[]) {
  return parseInstallOptions(args).ignored;
}

/** Print what installScript builds, noting on stderr any target option it dropped. */
export function install(
  args: string[],
  command: InstallCommand = "install",
): number {
  return emit(() => {
    const script = installScript(args, command);
    for (const name of ignoredTargetOptions(args))
      console.error(
        `Fence Rider: ignored --${name}; ${command} targets come from the profile (FORGE_ENVIRONMENT, FORGE_SITE, FORGE_PRODUCT)`,
      );
    return script;
  });
}
