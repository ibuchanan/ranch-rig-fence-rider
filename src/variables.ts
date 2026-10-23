import { checkManifest, configure } from "./configured";
import type { Io } from "./io";
import { validateTarget } from "./target";
import { planUploads, type Upload } from "./variables-plan";
import { describeStage, runWorkflow, type Workflow } from "./workflow";

export const variablesHelp = [
  "Encrypts and uploads each runtime-scope value with forge variables set --encrypt, so run it when the variables change; deploy never uploads.",
  "Target: explicit option, resolved FORGE_ENVIRONMENT, then development.",
  "Resolves the whole profile once and checks optional manifest declarations before the first upload. Local controls, empty values and values starting with a dash are refused.",
  "Forge options are not accepted. Uploads are not rolled back; a failure after the first may leave remote variables changed.",
  "SecretSpec and Forge must be installed on PATH and authenticated separately.",
].join("\n");

async function upload(
  tool: string,
  uploads: Upload[],
  env: NodeJS.ProcessEnv,
  workflow: Workflow,
  io: Io,
) {
  for (const { key, args } of uploads) {
    workflow.stage = `encrypted upload for ${key}`;
    workflow.uploadAttempted = true;
    io.out(`Fence Rider: ${describeStage(workflow)}.`);
    await io.capture(tool, args, workflow.signal, env);
  }
}

async function performUpload(
  explicitTarget: string | undefined,
  workflow: Workflow,
  io: Io,
) {
  if (explicitTarget !== undefined) workflow.target = explicitTarget;
  const { forge, scopeMembers, values, environment, env } =
    await configure(workflow);
  workflow.stage = "environment target validation";
  const target = validateTarget(explicitTarget ?? environment ?? "development");
  workflow.target = target;
  await checkManifest(scopeMembers, workflow);
  const runtime = await scopeMembers("runtime");
  workflow.stage =
    "runtime selection validation (local controls, empty and leading-dash upload values unsupported)";
  const uploads = planUploads({ target, runtime, values });
  await upload(forge, uploads, env, workflow, io);
  io.out(`Uploaded ${uploads.length} runtime variable(s).`);
}

/** Encrypt and upload the runtime values for one environment, with secret-safe diagnostics. */
export async function variables(
  target: string | undefined,
  io: Io,
): Promise<number> {
  return runWorkflow((workflow) => performUpload(target, workflow, io), io);
}
