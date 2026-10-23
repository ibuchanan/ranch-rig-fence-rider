import { forgeUnderSecretSpec } from "./shell";

export const deployHelp = [
  "Prints a shell script that runs forge deploy under secretspec run with the whole profile.",
  'Run it from a package script: cmd=$(fence-rider deploy) && sh -c "$cmd" sh',
  "Target: explicit option, resolved FORGE_ENVIRONMENT, then development. A target must be non-empty and not start with a dash.",
  "Put Forge arguments after --; they may override the injected target. Arguments appended after sh are passed too.",
  "Deploy never uploads runtime variables; run fence-rider variables first when they change.",
  "Forge input/output is inherited, live and unredacted. SecretSpec and Forge must be installed on PATH and authenticated separately.",
].join("\n");

/** Build a deploy script from parsed wrapper options and explicitly forwarded Forge arguments. */
export function deployScript(forwarded: string[], environment?: string) {
  return forgeUnderSecretSpec({ command: "deploy", forwarded, environment });
}
