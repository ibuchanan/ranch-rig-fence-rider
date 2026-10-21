import { type CommandSpec, parseForgeArgs } from "./forge-args";

export type InstallCommand = "install" | "uninstall";

const installSpec: CommandSpec = {
  owned: { environment: "e", site: "s", product: "p" },
  help: ["--help", "-h"],
};

/**
 * Target options are recognized only to be refused: forwarding one would hand
 * Forge a second copy of an option the wrapper injects from the profile.
 */
export function parseInstallOptions(args: string[]) {
  const { owned, forwarded, help } = parseForgeArgs(installSpec, args);
  if (Object.keys(owned).length)
    throw new Error(
      "Target options are not accepted; set FORGE_ENVIRONMENT, FORGE_SITE and FORGE_PRODUCT in the profile, or run secretspec and forge directly",
    );
  return { forwarded, help };
}
