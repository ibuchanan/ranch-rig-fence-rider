import { type CommandSpec, parseForgeArgs } from "./forge-args";
import { isLocalControl, isOptionValue } from "./policy";

export type DeployOptions = ReturnType<typeof parseDeployOptions>;

export type DeployPlan = {
  target: string;
  /** Runtime keys to encrypt, in declaration order, with the Forge arguments for each. */
  uploads: { key: string; args: string[] }[];
  deployArgs: string[];
};

const deploySpec: CommandSpec = {
  owned: { environment: "e" },
  help: ["--help", "-h"],
};

export function validateTarget(target: string) {
  if (typeof target !== "string" || !isOptionValue(target))
    throw new Error("Invalid Forge target");
  return target;
}

export function parseDeployOptions(args: string[]) {
  const { owned, forwarded, help } = parseForgeArgs(
    deploySpec,
    args,
    (_name, value) => validateTarget(value),
  );
  return { explicitTarget: owned["environment"], forwarded, help };
}

function validateRuntime(names: string[], values: Record<string, string>) {
  for (const key of names) {
    if (isLocalControl(key))
      throw new Error("Local control cannot be uploaded");
    const value = values[key];
    if (value !== undefined && !isOptionValue(value))
      throw new Error("Unsupported Forge positional value");
  }
}

/**
 * Decide the Forge target and exact Forge arguments without touching any tool.
 * The explicit target wins, then the resolved environment, then development.
 */
export function planDeploy(input: {
  explicitTarget: string | undefined;
  environment: string | undefined;
  runtime: string[];
  values: Record<string, string>;
  forwarded: string[];
}): DeployPlan {
  const target = validateTarget(
    input.explicitTarget ?? input.environment ?? "development",
  );
  validateRuntime(input.runtime, input.values);
  return {
    target,
    uploads: input.runtime.flatMap((key) => {
      const value = input.values[key];
      return value === undefined
        ? []
        : [
            {
              key,
              args: [
                "variables",
                "set",
                "--encrypt",
                "--environment",
                target,
                key,
                value,
              ],
            },
          ];
    }),
    deployArgs: ["deploy", "--environment", target, ...input.forwarded],
  };
}
