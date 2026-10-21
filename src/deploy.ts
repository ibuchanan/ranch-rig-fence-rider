import { checkManifest, configure } from "./configured";
import {
  type DeployOptions,
  type DeployPlan,
  parseDeployOptions,
  planDeploy,
  validateTarget,
} from "./deploy-plan";
import {
  CommandFailure,
  capture,
  checkInterruption,
  DelegatedFailure,
} from "./process";
import { describeStage, runWorkflow, type Workflow } from "./workflow";

export const deployUsage = [
  "Usage: fence-rider deploy [-e, --environment TARGET] [Forge options]",
  "Target: explicit option, resolved FORGE_ENVIRONMENT, then development.",
  "Conflicting resolved names fail even with an explicit target.",
  "SecretSpec and Forge must be installed on PATH and authenticated separately.",
].join("\n");

async function uploadRuntime(
  tool: string,
  uploads: DeployPlan["uploads"],
  env: NodeJS.ProcessEnv,
  workflow: Workflow,
) {
  for (const { key, args } of uploads) {
    workflow.stage = `encrypted upload for ${key}`;
    workflow.uploadAttempted = true;
    console.log(`Fence Rider: ${describeStage(workflow)}.`);
    await capture(tool, args, workflow.signal, env);
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

async function performDeployment(options: DeployOptions, workflow: Workflow) {
  if (options.explicitTarget !== undefined)
    workflow.target = options.explicitTarget;
  const { forge, scopeMembers, values, environment, env } =
    await configure(workflow);
  workflow.stage = "environment target validation";
  workflow.target = validateTarget(
    options.explicitTarget ?? environment ?? "development",
  );
  await checkManifest(scopeMembers, workflow);
  const runtime = await scopeMembers("runtime");
  workflow.stage =
    "runtime selection validation (local controls, empty and leading-dash upload values unsupported)";
  const plan = planDeploy({
    explicitTarget: options.explicitTarget,
    environment,
    runtime,
    values,
    forwarded: options.forwarded,
  });
  await uploadRuntime(forge, plan.uploads, env, workflow);
  workflow.stage = "deployment";
  console.log(`Fence Rider: ${describeStage(workflow)}.`);
  await delegate(() => capture(forge, plan.deployArgs, workflow.signal, env));
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
