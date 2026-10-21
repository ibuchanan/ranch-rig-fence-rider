import { type CommandSpec, parseForgeArgs } from "./forge-args";
import { isOptionValue } from "./policy";

export type InstallCommand = "install" | "uninstall";

const installSpec: CommandSpec = {
  owned: { environment: "e", site: "s", product: "p" },
  help: ["--help", "-h"],
};

function validateTarget(candidate: string | undefined): string {
  if (!candidate || !isOptionValue(candidate))
    throw new Error("Missing or invalid installation target");
  return candidate;
}

/**
 * Target options are recognized only to be refused: forwarding one would hand
 * Forge a second copy of an option the wrapper injects from the profile.
 */
export function parseInstallOptions(args: string[]) {
  const { owned, forwarded, help } = parseForgeArgs(installSpec, args);
  if (Object.keys(owned).length)
    throw new Error("Target options are not accepted");
  return { forwarded, help };
}

/**
 * Build the exact Forge arguments without touching any tool. Site and product
 * come from the profile, and only the environment falls back to development.
 */
export function planInstall(input: {
  command: InstallCommand;
  values: Record<string, string>;
  environment: string | undefined;
  forwarded: string[];
}): string[] {
  const targets = {
    environment: input.environment ?? "development",
    site: input.values["FORGE_SITE"],
    product: input.values["FORGE_PRODUCT"],
  };
  const effective = Object.entries(targets).flatMap(([name, value]) => [
    `--${name}`,
    validateTarget(value),
  ]);
  return [input.command, ...effective, ...input.forwarded];
}
