import { configure } from "./configured";
import { type CommandSpec, parseForgeArgs } from "./forge-args";
import { isOptionValue } from "./policy";
import { checkInterruption, passthrough } from "./process";
import { runWorkflow } from "./workflow";

function validateTarget(candidate: string | undefined): string {
  if (!candidate || !isOptionValue(candidate))
    throw new Error("Missing or invalid installation target");
  return candidate;
}

const installSpec: CommandSpec = {
  owned: { environment: "e", site: "s", product: "p" },
  help: ["--help", "-h"],
};

function parseTargets(args: string[]) {
  const { owned, forwarded, help } = parseForgeArgs(
    installSpec,
    args,
    (_name, value) => validateTarget(value),
  );
  return { targets: owned, forwarded, help };
}

function effectiveTargets(
  targets: Record<string, string>,
  values: Record<string, string>,
  environment: string | undefined,
) {
  const defaults = {
    environment: environment ?? "development",
    site: values["FORGE_SITE"],
    product: values["FORGE_PRODUCT"],
  };
  return Object.entries({ ...defaults, ...targets }).flatMap(
    ([name, value]) => [`--${name}`, validateTarget(value)],
  );
}

const installPolicy = {
  install:
    "Use --upgrade [all|code], --confirm-scopes and --non-interactive only when intended.",
  uninstall:
    "Uninstall changes remote installation state; Forge owns remaining interaction. Forge 14.2.0 does not support --non-interactive. No upgrade, consent, approval or confirmation switches are injected.",
};

export function installUsage(command: "install" | "uninstall") {
  return [
    `Usage: fence-rider ${command} [-e, --environment TARGET] [-s, --site URL] [-p, --product PRODUCT] [Forge options]`,
    "Targets: explicit option, then resolved FORGE_SITE / FORGE_PRODUCT / FORGE_ENVIRONMENT (FORGE_ENV legacy alias). Only environment falls back to development.",
    "Site and product are required; Forge validates their values.",
    "The whole profile must resolve; conflicting environment aliases fail even with overrides.",
    installPolicy[command],
    "No runtime uploads, variable deletion or deployment.",
    "Forge input/output is inherited, live and unredacted. SecretSpec and Forge must be installed on PATH and authenticated separately.",
  ].join("\n");
}

/** Run one installation lifecycle command without deployment or runtime synchronization. */
export async function install(
  args: string[],
  command: "install" | "uninstall" = "install",
): Promise<number> {
  const operation = command === "install" ? "installation" : "uninstallation";
  return runWorkflow(async (workflow) => {
    workflow.stage = `${operation} option validation`;
    const { targets, forwarded, help } = parseTargets(args);
    if (help) {
      console.log(installUsage(command));
      return;
    }
    const { forge, env, values, environment } = await configure(workflow);
    workflow.stage = `${operation} target validation (environment, site and product required)`;
    const effective = effectiveTargets(targets, values, environment);
    workflow.stage = operation;
    await passthrough(
      forge,
      [command, ...effective, ...forwarded],
      workflow.signal,
      env,
    );
    checkInterruption(workflow.signal);
  });
}
