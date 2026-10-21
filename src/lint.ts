import { checkManifest, configure } from "./configured";
import { type CommandSpec, parseForgeArgs } from "./forge-args";
import { checkInterruption, passthrough } from "./process";
import { runWorkflow } from "./workflow";

export const lintUsage = [
  "Usage: fence-rider lint [Forge options]",
  "Resolve the whole active profile, check optional manifest metadata, then lint.",
  "Forge stdin is inherited; stdout/stderr stream live and unredacted. Upstream output may expose values.",
  "No target flags are injected and no runtime variables are uploaded.",
  "SecretSpec and Forge must be installed on PATH and authenticated separately.",
].join("\n");

const lintSpec: CommandSpec = {
  owned: {},
  help: ["--help", "-h"],
};

/** Run configured Forge lint with inherited input and unredacted live output. */
export async function lint(args: string[]): Promise<number> {
  const { forwarded, help } = parseForgeArgs(lintSpec, args);
  if (help) {
    console.log(lintUsage);
    return 0;
  }
  return runWorkflow(async (state) => {
    const { forge, env, scopeMembers } = await configure(state);
    await checkManifest(scopeMembers, state);
    state.stage = "lint";
    await passthrough(forge, ["lint", ...forwarded], state.signal, env);
    checkInterruption(state.signal);
  });
}
