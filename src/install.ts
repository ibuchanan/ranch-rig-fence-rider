import { prerequisite } from "./configured";
import { type InstallCommand, parseInstallOptions } from "./install-plan";
import { checkInterruption, passthrough } from "./process";
import { runWorkflow } from "./workflow";

const installPolicy = {
  install:
    "Use --upgrade [all|code], --confirm-scopes and --non-interactive only when intended.",
  uninstall:
    "Uninstall changes remote installation state; Forge owns remaining interaction. Forge 14.2.0 does not support --non-interactive. No upgrade, consent, approval or confirmation switches are injected.",
};

export function installUsage(command: InstallCommand) {
  return [
    `Usage: fence-rider ${command} [Forge options]`,
    "Runs forge under secretspec run, with the whole profile resolved into its environment. Targets come from FORGE_SITE / FORGE_PRODUCT / FORGE_ENVIRONMENT; only environment falls back to development.",
    "Site and product are required, and no target may be empty or start with a dash; Forge validates their values.",
    "The wrapper's own target options (-e/--environment, -s/--site, -p/--product) are not accepted; for other targets run secretspec and forge directly.",
    "Unlike lint and deploy, values are not validated by Fence Rider, and an exported variable the profile does not resolve (or declare) stays visible to Forge.",
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

/** Run one installation lifecycle command without deployment or runtime synchronization. */
export async function install(
  args: string[],
  command: InstallCommand = "install",
): Promise<number> {
  const operation = command === "install" ? "installation" : "uninstallation";
  return runWorkflow(async (workflow) => {
    workflow.stage = `${operation} option validation (target options are not accepted; set FORGE_ENVIRONMENT, FORGE_SITE and FORGE_PRODUCT in the profile, or run forge directly)`;
    const { forwarded, help } = parseInstallOptions(args);
    if (help) {
      console.log(installUsage(command));
      return;
    }
    const secretspec = prerequisite("secretspec", workflow);
    prerequisite("forge", workflow);
    workflow.stage = operation;
    await passthrough(
      secretspec,
      [
        "run",
        "--scope",
        "",
        "--",
        "sh",
        "-c",
        targetScript,
        "sh",
        command,
        ...forwarded,
      ],
      workflow.signal,
    );
    checkInterruption(workflow.signal);
  });
}
