import { checkManifest, configure, members } from "./configured";
import { type CommandSpec, parseForgeArgs } from "./forge-args";
import { isLocalControl, isOptionValue } from "./policy";
import { checkInterruption, passthrough } from "./process";
import { runWorkflow } from "./workflow";

function validateTarget(target: string) {
  if (!isOptionValue(target)) throw new Error("Invalid tunnel environment");
  return target;
}

function injectRuntime({
  env,
  config,
  properties,
  values,
}: Awaited<ReturnType<typeof configure>>) {
  if (Object.keys(properties).some((key) => key.startsWith("FORGE_USER_VAR_")))
    throw new Error("Reserved tunnel prefix in application declaration");
  Object.keys(env)
    .filter((key) => key.startsWith("FORGE_USER_VAR_"))
    .forEach((key) => {
      delete env[key];
    });
  const runtime = members(config, "runtime", properties);
  validateRuntime(runtime);
  for (const key of runtime) {
    if (values[key] !== undefined) env[`FORGE_USER_VAR_${key}`] = values[key];
  }
}

function validateRuntime(runtime: string[]) {
  for (const key of runtime) {
    if (isLocalControl(key))
      throw new Error("Local control cannot be a tunnel runtime variable");
  }
}

export const tunnelUsage = [
  "Usage: fence-rider tunnel [-e, --environment TARGET] [Forge options]",
  "Target: explicit option, resolved FORGE_ENVIRONMENT (FORGE_ENV legacy alias), then development. Forge supports tunnels only for development environments.",
  "Resolve the whole profile once; check optional manifest declarations. Runtime members alone map to FORGE_USER_VAR_<name>; empty strings are supported. Ambient prefixed values are removed; declarations using that reserved prefix are rejected.",
  "Forge input/output streams live and unredacted; app logs may expose values. -h is debug host, not help; use --help.",
  "No remote variable uploads/deletion, deployment or installation. SecretSpec and Forge must be installed on PATH and authenticated separately.",
].join("\n");

// -h is Forge's debug host, so only --help requests wrapper help.
const tunnelSpec: CommandSpec = {
  owned: { environment: "e" },
  help: ["--help"],
};

function parseOptions(args: string[]) {
  const { owned, forwarded, help } = parseForgeArgs(
    tunnelSpec,
    args,
    (_name, value) => validateTarget(value),
  );
  return { target: owned["environment"], forwarded, help };
}

function effectiveTarget(
  explicit: string | undefined,
  configured: string | undefined,
) {
  return validateTarget(explicit ?? configured ?? "development");
}

export async function tunnel(args: string[]): Promise<number> {
  return runWorkflow(async (workflow) => {
    workflow.stage = "tunnel option validation";
    const options = parseOptions(args);
    if (options.help) {
      console.log(tunnelUsage);
      return;
    }
    const configured = await configure(workflow);
    const { forge, env, config, properties, environment } = configured;
    workflow.stage = "tunnel target validation (development environments only)";
    const target = effectiveTarget(options.target, environment);
    await checkManifest(config, properties, workflow);
    workflow.stage = "tunnel runtime selection validation";
    injectRuntime(configured);
    workflow.stage = "tunnel";
    await passthrough(
      forge,
      ["tunnel", "--environment", target, ...options.forwarded],
      workflow.signal,
      env,
    );
    checkInterruption(workflow.signal);
  });
}
