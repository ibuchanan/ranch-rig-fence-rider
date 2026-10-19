import {
  CommandFailure,
  checkInterruption,
  configure,
  run,
} from "./configured";

type Configured = Awaited<ReturnType<typeof configure>>;

function validateTarget(target: string) {
  if (
    typeof target !== "string" ||
    !/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(target)
  ) {
    throw new Error("Invalid Forge target");
  }
  return target;
}

function members(
  config: Configured["config"],
  scope: string,
  properties: Record<string, unknown>,
) {
  return (config.scopes?.[scope]?.secrets ?? []).filter((key) =>
    Object.hasOwn(properties, key),
  );
}

async function validateManifest(names: string[]) {
  const manifest = Bun.YAML.parse(await Bun.file("manifest.yml").text()) as {
    environment?: { variables?: (string | { key: string })[] };
  };
  const declarations = manifest?.environment?.variables ?? [];
  if (!Array.isArray(declarations))
    throw new Error("Invalid manifest variables");
  const keys = new Set(
    declarations.map((entry) =>
      typeof entry === "string" ? entry : entry?.key,
    ),
  );
  return names.find((key) => !keys.has(key));
}

function validateRuntime(names: string[], values: Record<string, string>) {
  for (const key of names) {
    if (
      [
        "FORGE_ENVIRONMENT",
        "FORGE_ENV",
        "FORGE_SITE",
        "FORGE_PRODUCT",
      ].includes(key)
    ) {
      throw new Error("Local control cannot be uploaded");
    }
    const value = values[key];
    if (value !== undefined) validateUploadValue(value);
  }
}

function validateUploadValue(value: string) {
  if (value === "" || value.startsWith("-"))
    throw new Error("Unsupported Forge positional value");
}

function normalizeGroupedTarget(arg: string, forwarded: string[]) {
  if (!/^-f+e/.test(arg)) return arg;
  const environmentIndex = arg.indexOf("e");
  forwarded.push(arg.slice(0, environmentIndex));
  return `-${arg.slice(environmentIndex)}`;
}

function takeTarget(arg: string, pending: string[]) {
  if (["--environment", "-e"].includes(arg)) {
    const target = pending.shift();
    if (target === undefined) throw new Error("Missing environment");
    return target;
  }
  return /^(?:--environment=|-e)(.*)$/s.exec(arg)?.[1];
}

function forwardValueOption(
  arg: string,
  pending: string[],
  forwarded: string[],
) {
  if (!(arg === "--tag" || /^-f*t$/.test(arg) || arg === "--approve"))
    return false;
  forwarded.push(arg, ...pending.splice(0, 1));
  return true;
}

function parseDeployArgument(
  arg: string,
  pending: string[],
  options: { explicitTarget?: string; forwarded: string[] },
) {
  if (forwardValueOption(arg, pending, options.forwarded)) return;
  const candidate = takeTarget(arg, pending);
  if (candidate === undefined) {
    options.forwarded.push(arg);
    return;
  }
  if (options.explicitTarget !== undefined)
    throw new Error("Duplicate environment");
  options.explicitTarget = validateTarget(candidate);
}

function parseDeployOptions(args: string[]) {
  const options: {
    explicitTarget?: string;
    forwarded: string[];
    help: boolean;
  } = { forwarded: [], help: false };
  const pending = [...args];
  while (pending.length) {
    const arg = normalizeGroupedTarget(
      pending.shift() as string,
      options.forwarded,
    );
    if (arg === "--") {
      options.forwarded.push(arg, ...pending);
      break;
    }
    if (/^(?:--help|-f*h)$/.test(arg)) {
      options.help = true;
      break;
    }
    parseDeployArgument(arg, pending, options);
  }
  return options;
}

type Deployment = {
  stage: string;
  target: string | undefined;
  uploadAttempted: boolean;
  signal: AbortSignal;
};

async function checkManifest(
  config: Configured["config"],
  properties: Record<string, unknown>,
  state: Deployment,
) {
  state.stage = `manifest validation (target ${state.target})`;
  if (!config.scopes?.["manifest"]) return;
  const missing = await validateManifest(
    members(config, "manifest", properties),
  );
  if (!missing) return;
  state.stage = `manifest declaration for ${missing} (target ${state.target})`;
  throw new Error("Missing manifest declaration");
}

async function uploadRuntime(
  tool: string,
  names: string[],
  env: NodeJS.ProcessEnv,
  state: Deployment,
) {
  for (const key of names) {
    const value = env[key];
    if (value === undefined) continue;
    state.stage = `encrypted upload for ${key} (target ${state.target})`;
    state.uploadAttempted = true;
    console.log(`Fence Rider: ${state.stage}.`);
    await run(
      tool,
      [
        "variables",
        "set",
        "--encrypt",
        "--environment",
        state.target as string,
        key,
        value,
      ],
      state.signal,
      env,
    );
  }
}

async function performDeployment(
  options: ReturnType<typeof parseDeployOptions>,
  state: Deployment,
) {
  state.target = options.explicitTarget;
  const { forge, config, properties, values, environment, env } =
    await configure(state);
  state.stage = "environment target validation";
  state.target = validateTarget(
    options.explicitTarget ?? environment ?? "development",
  );
  await checkManifest(config, properties, state);
  state.stage = `runtime selection validation (target ${state.target}; local controls, empty and leading-dash upload values unsupported)`;
  const runtime = members(config, "runtime", properties);
  validateRuntime(runtime, values);
  await uploadRuntime(forge, runtime, env, state);
  state.stage = `deployment (target ${state.target})`;
  console.log(`Fence Rider: ${state.stage}.`);
  await run(
    forge,
    ["deploy", "--environment", state.target, ...options.forwarded],
    state.signal,
    env,
  );
  checkInterruption(state.signal);
  console.log("Deployment completed.");
}

function failureStage(state: Deployment) {
  if (state.target && !state.stage.includes("(target "))
    return `${state.stage} (target ${state.target})`;
  return state.stage;
}

function reportFailure(error: unknown, state: Deployment) {
  const detail = error instanceof CommandFailure ? `: ${error.message}` : "";
  const warning = state.uploadAttempted
    ? " Remote variables may already have changed; no rollback was attempted."
    : "";
  console.error(
    `Fence Rider: ${failureStage(state)} failed${detail}. No further commands were run.${warning}`,
  );
}

function failureStatus(error: unknown, state: Deployment) {
  if (state.signal.aborted) return state.signal.reason === "SIGINT" ? 130 : 143;
  return deploymentFailureStatus(error, state.stage);
}

function deploymentFailureStatus(error: unknown, stage: string) {
  return error instanceof CommandFailure && stage.startsWith("deployment (")
    ? error.exitCode
    : 1;
}

/** Synchronize selected encrypted variables, then deploy with secret-safe diagnostics. */
export async function deploy(args: string[] = []): Promise<number> {
  const interruption = new AbortController();
  const onInterrupt = () => interruption.abort("SIGINT");
  const onTerminate = () => interruption.abort("SIGTERM");
  process.on("SIGINT", onInterrupt);
  process.on("SIGTERM", onTerminate);
  const state: Deployment = {
    stage: "environment option validation",
    target: undefined,
    uploadAttempted: false,
    signal: interruption.signal,
  };
  try {
    const options = parseDeployOptions(args);
    if (options.help) {
      console.log(
        "Usage: fence-rider deploy [-e, --environment TARGET] [Forge options]\nTarget: explicit option, resolved FORGE_ENVIRONMENT (FORGE_ENV legacy alias), then development.\nConflicting resolved names fail even with an explicit target.\nSecretSpec and Forge must be installed on PATH and authenticated separately.",
      );
      return 0;
    }
    await performDeployment(options, state);
    return 0;
  } catch (error) {
    reportFailure(error, state);
    return failureStatus(error, state);
  } finally {
    process.removeListener("SIGINT", onInterrupt);
    process.removeListener("SIGTERM", onTerminate);
  }
}
