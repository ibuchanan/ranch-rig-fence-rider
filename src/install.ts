import { type InstallCommand, parseInstallOptions } from "./install-plan";
import type { Io } from "./io";
import { emit, forgeUnderSecretSpec } from "./shell";

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
    "The target options -e/--environment, -s/--site and -p/--product are not accepted; for other targets run secretspec and forge directly.",
    "Fence Rider does not validate values, and an exported variable the profile does not resolve (or declare) stays visible to Forge.",
    installPolicy[command],
    "No runtime uploads, variable deletion or deployment.",
    "Forge input/output is inherited, live and unredacted. SecretSpec and Forge must be installed on PATH and authenticated separately.",
  ].join("\n");
}

/** The script that runs one installation lifecycle command with the profile in its environment, or the usage text for help; throws on a refusal. */
export function installScript(args: string[], command: InstallCommand) {
  const { forwarded, help } = parseInstallOptions(args);
  if (help) return installUsage(command);
  return forgeUnderSecretSpec({
    command,
    forwarded,
    targets: ["environment", "site", "product"],
  });
}

/** Print what installScript builds. */
export function install(
  args: string[],
  io: Io,
  command: InstallCommand = "install",
): number {
  return emit(() => installScript(args, command), io);
}
