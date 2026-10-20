import {
  checkInterruption,
  checkManifest,
  configure,
  members,
  reportConfiguredFailure,
  run,
  workflowInterruption,
} from "./configured";

function validateTarget(target: string) {
  if (
    ["staging", "production"].includes(target) ||
    !/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(target)
  )
    throw new Error("Unsupported tunnel environment");
  return target;
}

function consumesValue(arg: string, pending: string[]) {
  if (
    ["--url", "--local-port", "--debugFunctionHandlers", "-u", "-f"].includes(
      arg,
    )
  )
    return true;
  return (
    ["--debugHost", "--debugStartingPort", "-h", "-p"].includes(arg) &&
    pending[0]?.startsWith("-") === false
  );
}

function forwardOption(arg: string, pending: string[], forwarded: string[]) {
  forwarded.push(arg);
  const name = arg.replace(/^-[dn]*([fhpu])$/, "-$1");
  if (consumesValue(name, pending)) forwarded.push(...pending.splice(0, 1));
}

function optionTarget(arg: string, pending: string[]) {
  if (["-e", "--environment"].includes(arg)) return pending.shift() ?? "";
  return /^(?:--environment=|-e)(.*)$/s.exec(arg)?.[1];
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
    if (
      [
        "FORGE_ENVIRONMENT",
        "FORGE_ENV",
        "FORGE_SITE",
        "FORGE_PRODUCT",
      ].includes(key)
    )
      throw new Error("Local control cannot be a tunnel runtime variable");
  }
}

type TunnelOptions = { forwarded: string[]; target?: string; help: boolean };

function parseArgument(arg: string, pending: string[], options: TunnelOptions) {
  const grouped = /^-([dn]+)e(.*)$/s.exec(arg);
  if (grouped) {
    options.forwarded.push(`-${grouped[1]}`);
    arg = `-e${grouped[2]}`;
  }
  const candidate = optionTarget(arg, pending);
  if (candidate === undefined) {
    forwardOption(arg, pending, options.forwarded);
    return;
  }
  if (options.target !== undefined) throw new Error("Duplicate environment");
  options.target = validateTarget(candidate);
}

function parseOptions(args: string[]) {
  const options: TunnelOptions = { forwarded: [], help: false };
  const pending = [...args];
  while (pending.length) {
    const arg = pending.shift() as string;
    switch (arg) {
      case "--":
        options.forwarded.push(arg, ...pending);
        return options;
      case "--help":
        options.help = true;
        return options;
      default:
        parseArgument(arg, pending, options);
    }
  }
  return options;
}

function effectiveTarget(
  explicit: string | undefined,
  configured: string | undefined,
) {
  return validateTarget(explicit ?? configured ?? "development");
}

export async function tunnel(args: string[]): Promise<number> {
  const interruption = workflowInterruption();
  const state = {
    stage: "tunnel option validation",
    signal: interruption.signal,
  };
  try {
    const options = parseOptions(args);
    if (options.help) {
      console.log(
        "Usage: fence-rider tunnel [-e, --environment TARGET] [Forge options]\nTarget: explicit option, resolved FORGE_ENVIRONMENT (FORGE_ENV legacy alias), then development. Only development environments are supported; named environments must already be development environments. Staging/production are rejected.\nResolve the whole profile once; check optional manifest declarations. Runtime members alone map to FORGE_USER_VAR_<name>; empty strings are supported. Ambient prefixed values are removed; declarations using that reserved prefix are rejected.\nForge input/output streams live and unredacted; app logs may expose values. -h is debug host, not help; use --help.\nNo remote variable uploads/deletion, deployment or installation. SecretSpec and Forge must be installed on PATH and authenticated separately.",
      );
      return 0;
    }
    const configured = await configure(state);
    const { forge, env, config, properties, environment } = configured;
    state.stage = "tunnel target validation (development environments only)";
    const target = effectiveTarget(options.target, environment);
    await checkManifest(config, properties, state);
    state.stage = "tunnel runtime selection validation";
    injectRuntime(configured);
    state.stage = "tunnel";
    await run(
      forge,
      ["tunnel", "--environment", target, ...options.forwarded],
      state.signal,
      env,
      true,
    );
    checkInterruption(state.signal);
    return 0;
  } catch (error) {
    return reportConfiguredFailure(error, state, "tunnel");
  } finally {
    interruption.dispose();
  }
}
