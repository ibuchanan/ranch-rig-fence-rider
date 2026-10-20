import { checkManifest, configure, members } from "./configured";
import {
  CommandFailure,
  DelegatedFailure,
  capture,
  checkInterruption,
} from "./process";
import { isEnvironmentName, isLocalControl } from "./policy";
import { describeStage, runWorkflow, type Workflow } from "./workflow";

function validateTarget(target: string) {
  if (typeof target !== "string" || !isEnvironmentName(target))
    throw new Error("Invalid Forge target");
  return target;
}

function validateRuntime(names: string[], values: Record<string, string>) {
  for (const key of names) {
    if (isLocalControl(key))
      throw new Error("Local control cannot be uploaded");
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

async function uploadRuntime(
  tool: string,
  names: string[],
  env: NodeJS.ProcessEnv,
  target: string,
  workflow: Workflow,
) {
  for (const key of names) {
    const value = env[key];
    if (value === undefined) continue;
    workflow.stage = `encrypted upload for ${key}`;
    workflow.uploadAttempted = true;
    console.log(`Fence Rider: ${describeStage(workflow)}.`);
    await capture(
      tool,
      ["variables", "set", "--encrypt", "--environment", target, key, value],
      workflow.signal,
      env,
    );
  }
}

async function delegate(run: () => Promise<unknown>) {
  try {
    await run();
  } catch (error) {
    if (error instanceof CommandFailure)
      throw new DelegatedFailure(error.message, error.exitCode);
    throw error;
  }
}

async function performDeployment(
  options: ReturnType<typeof parseDeployOptions>,
  workflow: Workflow,
) {
  if (options.explicitTarget !== undefined)
    workflow.target = options.explicitTarget;
  const { forge, config, properties, values, environment, env } =
    await configure(workflow);
  workflow.stage = "environment target validation";
  const target = validateTarget(
    options.explicitTarget ?? environment ?? "development",
  );
  workflow.target = target;
  await checkManifest(config, properties, workflow);
  workflow.stage =
    "runtime selection validation (local controls, empty and leading-dash upload values unsupported)";
  const runtime = members(config, "runtime", properties);
  validateRuntime(runtime, values);
  await uploadRuntime(forge, runtime, env, target, workflow);
  workflow.stage = "deployment";
  console.log(`Fence Rider: ${describeStage(workflow)}.`);
  await delegate(() =>
    capture(
      forge,
      ["deploy", "--environment", target, ...options.forwarded],
      workflow.signal,
      env,
    ),
  );
  checkInterruption(workflow.signal);
  console.log("Deployment completed.");
}

/** Synchronize selected encrypted variables, then deploy with secret-safe diagnostics. */
export async function deploy(args: string[] = []): Promise<number> {
  return runWorkflow(async (workflow) => {
    workflow.stage = "environment option validation";
    const options = parseDeployOptions(args);
    if (options.help) {
      console.log(
        "Usage: fence-rider deploy [-e, --environment TARGET] [Forge options]\nTarget: explicit option, resolved FORGE_ENVIRONMENT (FORGE_ENV legacy alias), then development.\nConflicting resolved names fail even with an explicit target.\nSecretSpec and Forge must be installed on PATH and authenticated separately.",
      );
      return;
    }
    await performDeployment(options, workflow);
  });
}
