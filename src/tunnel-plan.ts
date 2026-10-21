import { type CommandSpec, parseForgeArgs } from "./forge-args";
import { isLocalControl, isOptionValue } from "./policy";

const reservedPrefix = "FORGE_USER_VAR_";

// -h is Forge's debug host, so only --help requests wrapper help.
const tunnelSpec: CommandSpec = {
  owned: { environment: "e" },
  help: ["--help"],
};

function validateTarget(target: string) {
  if (!isOptionValue(target)) throw new Error("Invalid tunnel environment");
  return target;
}

export function parseTunnelOptions(args: string[]) {
  const { owned, forwarded, help } = parseForgeArgs(
    tunnelSpec,
    args,
    (_name, value) => validateTarget(value),
  );
  return { target: owned["environment"], forwarded, help };
}

/** Explicit target, then the resolved environment, then development. */
export function tunnelTarget(
  explicit: string | undefined,
  configured: string | undefined,
) {
  return validateTarget(explicit ?? configured ?? "development");
}

export function tunnelArgs(target: string, forwarded: string[]) {
  return ["tunnel", "--environment", target, ...forwarded];
}

export function isReservedVariable(name: string) {
  return name.startsWith(reservedPrefix);
}

/** Map runtime members alone to FORGE_USER_VAR_<name>; empty strings are kept. */
export function tunnelRuntimeVariables(
  declared: string[],
  runtime: string[],
  values: Record<string, string>,
) {
  if (declared.some(isReservedVariable))
    throw new Error("Reserved tunnel prefix in application declaration");
  const variables: Record<string, string> = {};
  for (const key of runtime) {
    if (isLocalControl(key))
      throw new Error("Local control cannot be a tunnel runtime variable");
    const value = values[key];
    if (value !== undefined) variables[`${reservedPrefix}${key}`] = value;
  }
  return variables;
}
