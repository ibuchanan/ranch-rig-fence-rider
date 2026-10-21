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

export function parseInstallOptions(args: string[]) {
  const { owned, forwarded, help } = parseForgeArgs(
    installSpec,
    args,
    (_name, value) => validateTarget(value),
  );
  return { targets: owned, forwarded, help };
}

/**
 * Build the exact Forge arguments without touching any tool. Explicit
 * options override resolved FORGE_SITE / FORGE_PRODUCT / environment, and
 * only the environment falls back to development.
 */
export function planInstall(input: {
  command: InstallCommand;
  targets: Record<string, string>;
  values: Record<string, string>;
  environment: string | undefined;
  forwarded: string[];
}): string[] {
  const defaults = {
    environment: input.environment ?? "development",
    site: input.values["FORGE_SITE"],
    product: input.values["FORGE_PRODUCT"],
  };
  const effective = Object.entries({ ...defaults, ...input.targets }).flatMap(
    ([name, value]) => [`--${name}`, validateTarget(value)],
  );
  return [input.command, ...effective, ...input.forwarded];
}
