import { configure } from "./configured";
import { type CommandSpec, parseForgeArgs } from "./forge-args";
import { isEnvironmentName } from "./policy";
import { checkInterruption, passthrough } from "./process";
import { runWorkflow } from "./workflow";

function validateValue(value: string | undefined): string {
  if (!value || value.startsWith("-") || /[\s\p{Cc}]/u.test(value))
    throw new Error("Missing or invalid installation target");
  return value;
}

function validateSite(value: string) {
  const url = new URL(value.includes("://") ? value : `https://${value}`);
  if (!/^https?:$/.test(url.protocol) || `${url.username}${url.password}`)
    throw new Error("Invalid site URL");
}

function validateEnvironment(value: string) {
  if (!isEnvironmentName(value)) throw new Error("Invalid target");
}

function validateProduct(value: string) {
  if (!/^(jira|confluence|compass|bitbucket)$/i.test(value))
    throw new Error("Invalid target");
}

const targetValidators = {
  environment: validateEnvironment,
  site: validateSite,
  product: validateProduct,
};

type TargetName = keyof typeof targetValidators;

function validateTarget(
  name: TargetName,
  candidate: string | undefined,
): string {
  const value = validateValue(candidate);
  targetValidators[name](value);
  return value;
}

const installSpecs: Record<"install" | "uninstall", CommandSpec> = {
  // Forge 14.2.0 required-value options consume even switch-looking payloads.
  install: {
    owned: { environment: "e", site: "s", product: "p" },
    required: ["--app-id-override", "--major-version", "--unitId"],
    optional: [],
    help: ["--help", "-h"],
    grouped: "",
    rejected: /^--demo-site(?:=|$)|^-[dh]*d/,
  },
  uninstall: {
    owned: { environment: "e", site: "s", product: "p" },
    required: ["--app-id-override", "--installation-id", "-i"],
    optional: [],
    help: ["--help", "-h"],
    grouped: "",
  },
};

function parseTargets(args: string[], command: "install" | "uninstall") {
  const { owned, forwarded, help } = parseForgeArgs(
    installSpecs[command],
    args,
    (name, value) => validateTarget(name as TargetName, value),
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
    ([name, value]) => [`--${name}`, validateTarget(name as TargetName, value)],
  );
}

function printHelp(command: "install" | "uninstall") {
  const policy =
    command === "install"
      ? "Use --upgrade [all|code], --confirm-scopes and --non-interactive only when intended. Demo-site targeting is unsupported."
      : "Uninstall changes remote installation state; Forge owns remaining interaction. Forge 14.2.0 does not support --non-interactive. No upgrade, consent, approval or confirmation switches are injected.";
  console.log(
    `Usage: fence-rider ${command} [-e, --environment TARGET] [-s, --site URL] [-p, --product PRODUCT] [Forge options]\nTargets: explicit option, then resolved FORGE_SITE / FORGE_PRODUCT / FORGE_ENVIRONMENT (FORGE_ENV legacy alias). Only environment falls back to development.\nSite and product are required. Products: Jira, Confluence, Compass, Bitbucket (workspace URL).\nThe whole profile must resolve; conflicting environment aliases fail even with overrides.\n${policy}\nNo runtime uploads, variable deletion or deployment.\nForge input/output is inherited, live and unredacted. SecretSpec and Forge must be installed on PATH and authenticated separately.`,
  );
}

/** Run one installation lifecycle command without deployment or runtime synchronization. */
export async function install(
  args: string[],
  command: "install" | "uninstall" = "install",
): Promise<number> {
  const operation = command === "install" ? "installation" : "uninstallation";
  return runWorkflow(async (workflow) => {
    workflow.stage = `${operation} option validation`;
    const { targets, forwarded, help } = parseTargets(args, command);
    if (help) {
      printHelp(command);
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
