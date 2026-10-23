import { underSecretSpec } from "./shell";

export const lintHelp = [
  "Prints a shell script that runs forge lint under secretspec run with the whole active profile.",
  'Run it from a package script: cmd=$(fence-rider lint) && sh -c "$cmd" sh',
  "Put Forge arguments after --. Arguments appended by a script runner after sh are passed too.",
  "Forge stdin is inherited; stdout/stderr stream live and unredacted. Upstream output may expose values.",
  "No targets are injected and no runtime variables are uploaded. Unresolved optional declarations leave ambient values visible to Forge.",
  "SecretSpec and Forge CLI must be installed on PATH and authenticated separately; run fence-rider doctor to check them.",
].join("\n");

/** Build a lint script from the explicitly forwarded Forge arguments. */
export function lintScript(forwarded: string[]) {
  return underSecretSpec(["forge", "lint", ...forwarded]);
}
