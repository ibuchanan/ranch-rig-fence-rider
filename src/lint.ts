import { type CommandSpec, parseForgeArgs } from "./forge-args";
import { emit, underSecretSpec } from "./shell";

export const lintUsage = [
  "Usage: fence-rider lint [Forge options]",
  "Prints a shell script that runs forge lint under secretspec run, with the whole active profile resolved into its environment. Run it from a package script:",
  '  cmd=$(fence-rider lint) && sh -c "$cmd" sh',
  "Options given here are embedded in the script; options a script runner appends after `sh` are passed too.",
  "Forge stdin is inherited; stdout/stderr stream live and unredacted. Upstream output may expose values.",
  "No target flags are injected and no runtime variables are uploaded.",
  "Fence Rider does not validate values, and an exported variable the profile does not resolve (or declare) stays visible to Forge.",
  "SecretSpec and Forge must be installed on PATH and authenticated separately; run fence-rider doctor to check them.",
].join("\n");

const lintSpec: CommandSpec = {
  owned: {},
  help: ["--help", "-h"],
};

/** The script that runs Forge lint with the profile in its environment, or the usage text for help; throws on a refusal. */
export function lintScript(args: string[]) {
  const { forwarded, help } = parseForgeArgs(lintSpec, args);
  if (help) return lintUsage;
  return underSecretSpec(["forge", "lint", ...forwarded]);
}

/** Print what lintScript builds. */
export function lint(args: string[]): number {
  return emit(() => lintScript(args));
}
