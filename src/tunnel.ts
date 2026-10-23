import { runtimeNames } from "./configured";
import type { Io } from "./io";
import { forgeUnderSecretSpec } from "./shell";
import { tunnelPrologue } from "./tunnel-plan";
import { runWorkflow } from "./workflow";

export const tunnelHelp = [
  "Prints a shell script that runs forge tunnel under secretspec run, with the whole profile resolved into its environment. Run it from a package script:",
  '  cmd=$(fence-rider tunnel) && sh -c "$cmd" sh',
  "Put Forge arguments after --; they may override the injected target. Arguments appended after sh are passed too.",
  "Target: explicit option, resolved FORGE_ENVIRONMENT, then development. Forge supports tunnels only for development environments.",
  "Asks SecretSpec for the declared names and the runtime scope's members (never values) while printing. Runtime members alone map to FORGE_USER_VAR_<name>; empty strings are supported. Ambient prefixed values are removed; declarations using that reserved prefix are rejected.",
  "Forge input/output streams live and unredacted; app logs may expose values. -h shows wrapper help; use -- -h HOST for Forge's debug host.",
  "No remote variable uploads/deletion, deployment or installation. SecretSpec and Forge must be installed on PATH and authenticated separately.",
].join("\n");

/** Print the script that runs forge tunnel with only runtime members mapped. */
export async function tunnel(
  forwarded: string[],
  target: string | undefined,
  io: Io,
): Promise<number> {
  return runWorkflow(async (workflow) => {
    const { declared, runtime } = await runtimeNames(workflow);
    workflow.stage = "tunnel runtime selection validation";
    io.out(
      forgeUnderSecretSpec({
        command: "tunnel",
        forwarded,
        environment: target,
        prologue: tunnelPrologue(declared, runtime),
      }),
    );
  }, io);
}
