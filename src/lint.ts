import { checkManifest, configure } from "./configured";
import { checkInterruption, passthrough } from "./process";
import { runWorkflow } from "./workflow";

function helpRequested(args: string[]) {
  const pending = [...args];
  while (pending.length) {
    const arg = pending.shift();
    if (arg === "--approve") pending.shift();
    if (["--", "--help", "-h"].includes(arg as string)) return arg !== "--";
  }
  return false;
}

/** Run configured Forge lint with inherited input and unredacted live output. */
export async function lint(args: string[]): Promise<number> {
  if (helpRequested(args)) {
    console.log(
      "Usage: fence-rider lint [Forge options]\nResolve the whole active profile, check optional manifest metadata, then lint.\nForge stdin is inherited; stdout/stderr stream live and unredacted. Upstream output may expose values.\nNo target flags are injected and no runtime variables are uploaded.\nSecretSpec and Forge must be installed on PATH and authenticated separately.",
    );
    return 0;
  }
  return runWorkflow(async (state) => {
    const { forge, env, config, properties } = await configure(state);
    await checkManifest(config, properties, state);
    state.stage = "lint";
    await passthrough(forge, ["lint", ...args], state.signal, env);
    checkInterruption(state.signal);
  });
}
