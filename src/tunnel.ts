import { runtimeNames } from "./configured";
import { forgeUnderSecretSpec } from "./shell";
import { parseTunnelOptions, tunnelPrologue } from "./tunnel-plan";
import { runWorkflow } from "./workflow";

export const tunnelUsage = [
  "Usage: fence-rider tunnel [-e, --environment TARGET] [Forge options]",
  "Prints a shell script that runs forge tunnel under secretspec run, with the whole profile resolved into its environment. Run it from a package script:",
  '  cmd=$(fence-rider tunnel) && sh -c "$cmd" sh',
  "Options given here are embedded in the script; options a script runner appends after `sh` are passed too.",
  "Target: explicit option, resolved FORGE_ENVIRONMENT, then development. Forge supports tunnels only for development environments.",
  "Asks SecretSpec for the declared names and the runtime scope's members (never values) while printing. Runtime members alone map to FORGE_USER_VAR_<name>; empty strings are supported. Ambient prefixed values are removed; declarations using that reserved prefix are rejected.",
  "Forge input/output streams live and unredacted; app logs may expose values. -h is debug host, not help; use --help.",
  "No remote variable uploads/deletion, deployment or installation. SecretSpec and Forge must be installed on PATH and authenticated separately.",
].join("\n");

/** Print the script that runs forge tunnel with the runtime members mapped, or the usage text for help. */
export async function tunnel(args: string[]): Promise<number> {
  return runWorkflow(async (workflow) => {
    workflow.stage = "tunnel option validation";
    const options = parseTunnelOptions(args);
    if (options.help) {
      console.log(tunnelUsage);
      return;
    }
    const { declared, runtime } = await runtimeNames(workflow);
    workflow.stage = "tunnel runtime selection validation";
    console.log(
      forgeUnderSecretSpec({
        command: "tunnel",
        forwarded: options.forwarded,
        environment: options.target,
        prologue: tunnelPrologue(declared, runtime),
      }),
    );
  });
}
