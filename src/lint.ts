import { checkManifest, prerequisite, scopeMembers } from "./configured";
import { type CommandSpec, parseForgeArgs } from "./forge-args";
import { checkInterruption, passthrough } from "./process";
import { runWorkflow } from "./workflow";

export const lintUsage = [
  "Usage: fence-rider lint [Forge options]",
  "Check optional manifest metadata, then run forge lint under secretspec run with the whole active profile resolved into its environment.",
  "Unlike deploy and tunnel, values are not validated by Fence Rider, and an exported variable the profile does not resolve (or declare) stays visible to Forge.",
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
    const secretspec = prerequisite("secretspec", state);
    const forge = prerequisite("forge", state);
    await checkManifest(
      (scope) => scopeMembers(secretspec, scope, state),
      state,
    );
    state.stage = "lint";
    await passthrough(
      secretspec,
      ["run", "--scope", "", "--", forge, "lint", ...forwarded],
      state.signal,
    );
    checkInterruption(state.signal);
  });
}
