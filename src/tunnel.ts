import { checkManifest, configure } from "./configured";
import { checkInterruption, passthrough } from "./process";
import {
  isReservedVariable,
  parseTunnelOptions,
  tunnelArgs,
  tunnelRuntimeVariables,
  tunnelTarget,
} from "./tunnel-plan";
import { runWorkflow } from "./workflow";

function injectRuntime(
  { env, properties, values }: Awaited<ReturnType<typeof configure>>,
  runtime: string[],
) {
  const variables = tunnelRuntimeVariables(
    Object.keys(properties),
    runtime,
    values,
  );
  for (const key of Object.keys(env))
    if (isReservedVariable(key)) delete env[key];
  Object.assign(env, variables);
}

export const tunnelUsage = [
  "Usage: fence-rider tunnel [-e, --environment TARGET] [Forge options]",
  "Target: explicit option, resolved FORGE_ENVIRONMENT, then development. Forge supports tunnels only for development environments.",
  "Resolve the whole profile once; check optional manifest declarations. Runtime members alone map to FORGE_USER_VAR_<name>; empty strings are supported. Ambient prefixed values are removed; declarations using that reserved prefix are rejected.",
  "Forge input/output streams live and unredacted; app logs may expose values. -h is debug host, not help; use --help.",
  "No remote variable uploads/deletion, deployment or installation. SecretSpec and Forge must be installed on PATH and authenticated separately.",
].join("\n");

export async function tunnel(args: string[]): Promise<number> {
  return runWorkflow(async (workflow) => {
    workflow.stage = "tunnel option validation";
    const options = parseTunnelOptions(args);
    if (options.help) {
      console.log(tunnelUsage);
      return;
    }
    const configured = await configure(workflow);
    const { forge, env, scopeMembers, environment } = configured;
    workflow.stage = "tunnel target validation (development environments only)";
    const target = tunnelTarget(options.target, environment);
    await checkManifest(scopeMembers, workflow);
    const runtime = await scopeMembers("runtime");
    workflow.stage = "tunnel runtime selection validation";
    injectRuntime(configured, runtime);
    workflow.stage = "tunnel";
    await passthrough(
      forge,
      tunnelArgs(target, options.forwarded),
      workflow.signal,
      env,
    );
    checkInterruption(workflow.signal);
  });
}
