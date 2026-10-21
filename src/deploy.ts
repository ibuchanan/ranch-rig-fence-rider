import { emit, forgeUnderSecretSpec } from "./shell";
import { parseTargetOptions } from "./target";

export const deployUsage = [
  "Usage: fence-rider deploy [-e, --environment TARGET] [Forge options]",
  "Prints a shell script that runs forge deploy under secretspec run, with the whole profile resolved into its environment. Run it from a package script:",
  '  cmd=$(fence-rider deploy) && sh -c "$cmd" sh',
  "Options given here are embedded in the script; options a script runner appends after `sh` are passed too.",
  "Target: explicit option, resolved FORGE_ENVIRONMENT, then development; it must not be empty or start with a dash.",
  "Deploy does not upload variables, as forge deploy does not; run fence-rider variables first when they change.",
  "Forge input/output is inherited, live and unredacted. SecretSpec and Forge must be installed on PATH and authenticated separately.",
].join("\n");

/** The script that runs forge deploy with the profile in its environment, or the usage text for help; throws on a refusal. */
export function deployScript(args: string[]) {
  const { explicitTarget, forwarded, help } = parseTargetOptions(args);
  if (help) return deployUsage;
  return forgeUnderSecretSpec({
    command: "deploy",
    forwarded,
    environment: explicitTarget,
  });
}

/** Print what deployScript builds. */
export function deploy(args: string[]): number {
  return emit(() => deployScript(args));
}
