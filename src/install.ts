import { configure } from "./configured";
import {
  type InstallCommand,
  parseInstallOptions,
  planInstall,
} from "./install-plan";
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
    "Targets come from the resolved FORGE_SITE / FORGE_PRODUCT / FORGE_ENVIRONMENT. Only environment falls back to development.",
    "Site and product are required; Forge validates their values.",
    "The wrapper's own target options (-e/--environment, -s/--site, -p/--product) are not accepted; for other targets run secretspec and forge directly.",
    "The whole profile must resolve.",
    installPolicy[command],
    "No runtime uploads, variable deletion or deployment.",
    "Forge input/output is inherited, live and unredacted. SecretSpec and Forge must be installed on PATH and authenticated separately.",
  ].join("\n");
}

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
    const { forge, env, values, environment } = await configure(workflow);
    workflow.stage = `${operation} target validation (environment, site and product required)`;
    const forgeArgs = planInstall({
      command,
      values,
      environment,
      forwarded,
    });
    workflow.stage = operation;
    await passthrough(forge, forgeArgs, workflow.signal, env);
    checkInterruption(workflow.signal);
  });
}
