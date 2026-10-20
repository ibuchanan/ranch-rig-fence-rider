import { checkManifest, configure, members } from "./configured";
import {
  CommandFailure,
  DelegatedFailure,
  capture,
  checkInterruption,
} from "./process";
import { type CommandSpec, parseForgeArgs } from "./forge-args";
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

export const deployUsage = [
  "Usage: fence-rider deploy [-e, --environment TARGET] [Forge options]",
  "Target: explicit option, resolved FORGE_ENVIRONMENT (FORGE_ENV legacy alias), then development.",
  "Conflicting resolved names fail even with an explicit target.",
  "SecretSpec and Forge must be installed on PATH and authenticated separately.",
].join("\n");

const deploySpec: CommandSpec = {
  owned: { environment: "e" },
  required: ["--tag", "-t", "--approve"],
  optional: [],
  help: ["--help", "-h"],
  grouped: "f",
};

function parseDeployOptions(args: string[]) {
  const { owned, forwarded, help } = parseForgeArgs(
    deploySpec,
    args,
    (_name, value) => validateTarget(value),
  );
  return { explicitTarget: owned["environment"], forwarded, help };
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
      console.log(deployUsage);
      return;
    }
    await performDeployment(options, workflow);
  });
}
