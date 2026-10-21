import { type CommandSpec, parseForgeArgs } from "./forge-args";
import { isOptionValue } from "./policy";

const targetSpec: CommandSpec = {
  owned: { environment: "e" },
  help: ["--help", "-h"],
};

export function validateTarget(target: string) {
  if (typeof target !== "string" || !isOptionValue(target))
    throw new Error("Invalid Forge target");
  return target;
}

/** The `-e, --environment` option shared by deploy and variables; everything else is forwarded. */
export function parseTargetOptions(args: string[]) {
  const { owned, forwarded, help } = parseForgeArgs(
    targetSpec,
    args,
    (_name, value) => validateTarget(value),
  );
  return { explicitTarget: owned["environment"], forwarded, help };
}
