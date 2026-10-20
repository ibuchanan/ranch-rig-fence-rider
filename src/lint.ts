import { checkManifest, configure } from "./configured";
import { type CommandSpec, parseForgeArgs } from "./forge-args";
import { checkInterruption, passthrough } from "./process";
import { runWorkflow } from "./workflow";

const lintSpec: CommandSpec = {
  owned: {},
  required: ["--approve"],
  optional: [],
  help: ["--help", "-h"],
  grouped: "",
};

/** Run configured Forge lint with inherited input and unredacted live output. */
export async function lint(args: string[]): Promise<number> {
  const { forwarded, help } = parseForgeArgs(lintSpec, args);
  if (help) {
    console.log(
      "Usage: fence-rider lint [Forge options]\nResolve the whole active profile, check optional manifest metadata, then lint.\nForge stdin is inherited; stdout/stderr stream live and unredacted. Upstream output may expose values.\nNo target flags are injected and no runtime variables are uploaded.\nSecretSpec and Forge must be installed on PATH and authenticated separately.",
    );
    return 0;
  }
  return runWorkflow(async (state) => {
    const { forge, env, config, properties } = await configure(state);
    await checkManifest(config, properties, state);
    state.stage = "lint";
    await passthrough(forge, ["lint", ...forwarded], state.signal, env);
    checkInterruption(state.signal);
  });
}
