import { forgeUnderSecretSpec } from "./shell";

export type InstallCommand = "install" | "uninstall";

/** Command-specific installation policy shown below generated help. */
export function installHelp(command: InstallCommand) {
  return [
    `Prints a shell script that runs forge ${command} under secretspec run with the whole profile.`,
    `Run it from a package script: cmd=$(fence-rider ${command}) && sh -c "$cmd" sh`,
    "Profile defaults: FORGE_SITE / FORGE_PRODUCT / FORGE_ENVIRONMENT. Site and product are required; only environment falls back to development. Defaults must be non-empty and not start with a dash.",
    "Put Forge arguments after --; they can override profile-derived selectors. Arguments appended after sh are passed too. Unresolved optional declarations leave ambient values visible to Forge.",
    command === "install"
      ? "Use -- --upgrade [all|code], --confirm-scopes and --non-interactive only when intended. No consent or non-interactive flags are injected."
      : "Uninstall changes remote installation state; Forge owns interaction and does not support --non-interactive in 14.2.0. No upgrade, consent or confirmation flags are injected.",
    "No runtime uploads, variable deletion or deployment. Forge input/output is inherited, live and unredacted. SecretSpec and Forge must be installed on PATH and authenticated separately.",
  ].join("\n");
}

/** Build an installation script from explicitly forwarded Forge arguments. */
export function installScript(forwarded: string[], command: InstallCommand) {
  return forgeUnderSecretSpec({
    command,
    forwarded,
    targets: ["environment", "site", "product"],
  });
}
