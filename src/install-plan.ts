import { type CommandSpec, parseForgeArgs } from "./forge-args";

export type InstallCommand = "install" | "uninstall";

const installSpec: CommandSpec = {
  owned: { environment: "e", site: "s", product: "p" },
  help: ["--help", "-h"],
};

/**
 * Target options are recognized only to be dropped: forwarding one would hand
 * Forge a second copy of an option the script injects from the profile.
 */
export function parseInstallOptions(args: string[]) {
  const { owned, forwarded, help } = parseForgeArgs(installSpec, args);
  return { forwarded, help, ignored: Object.keys(owned) };
}
