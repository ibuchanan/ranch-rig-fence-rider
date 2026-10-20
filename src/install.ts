import {
  reportConfiguredFailure,
  checkInterruption,
  configure,
  run,
  workflowInterruption,
} from "./configured";

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

function validateTarget(name: string, candidate: string | undefined): string {
  const value = validateValue(candidate);
  const patterns: Record<string, RegExp> = {
    environment: /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/,
    product: /^(jira|confluence|compass|bitbucket)$/i,
  };
  if (patterns[name]?.test(value) === false) throw new Error("Invalid target");
  if (name === "site") validateSite(value);
  return value;
}

type InstallOptions = {
  targets: Record<string, string>;
  forwarded: string[];
  help: boolean;
};

function targetArgument(arg: string) {
  const short = /^-([esp])(.*)$/s.exec(arg);
  if (short) {
    if (short[2]?.startsWith("="))
      throw new Error("Unsupported short equals target");
    const names: Record<string, string> = {
      e: "environment",
      s: "site",
      p: "product",
    };
    arg = `--${names[short[1] as string]}${short[2] ? `=${short[2]}` : ""}`;
  }
  return /^--(environment|site|product)(?:=(.*))?$/s.exec(arg);
}

function takeTarget(arg: string, pending: string[], options: InstallOptions) {
  const match = targetArgument(arg);
  if (!match) {
    options.forwarded.push(arg);
    return;
  }
  const name = match[1] as string;
  if (Object.hasOwn(options.targets, name)) throw new Error("Duplicate target");
  options.targets[name] = validateTarget(name, match[2] ?? pending.shift());
}

function parseArgument(
  arg: string,
  pending: string[],
  options: InstallOptions,
  command: "install" | "uninstall",
) {
  if (command === "install" && /^--demo-site(?:=|$)|^-[dh]*d/.test(arg))
    throw new Error("Demo-site targeting is unsupported");
  // Forge 14.2.0 required-value options consume even switch-looking payloads.
  const required = {
    install: ["--app-id-override", "--major-version", "--unitId"],
    uninstall: ["--app-id-override", "--installation-id", "-i"],
  }[command];
  if (required.includes(arg)) {
    options.forwarded.push(arg, ...pending.splice(0, 1));
    return;
  }
  takeTarget(arg, pending, options);
}

function parseTargets(args: string[], command: "install" | "uninstall") {
  const options: InstallOptions = { targets: {}, forwarded: [], help: false };
  const pending = [...args];
  while (pending.length) {
    const arg = pending.shift() as string;
    if (arg === "--") {
      options.forwarded.push(arg, ...pending);
      break;
    }
    if (["--help", "-h"].includes(arg)) {
      options.help = true;
      break;
    }
    parseArgument(arg, pending, options, command);
  }
  return options;
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
    ([name, value]) => [`--${name}`, validateTarget(name, value)],
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
  const interruption = workflowInterruption();
  const operation = command === "install" ? "installation" : "uninstallation";
  const state = {
    stage: `${operation} option validation`,
    signal: interruption.signal,
  };
  try {
    const { targets, forwarded, help } = parseTargets(args, command);
    if (help) {
      printHelp(command);
      return 0;
    }
    const { forge, env, values, environment } = await configure(state);
    state.stage = `${operation} target validation (environment, site and product required)`;
    const effective = effectiveTargets(targets, values, environment);
    state.stage = operation;
    await run(
      forge,
      [command, ...effective, ...forwarded],
      state.signal,
      env,
      true,
    );
    checkInterruption(state.signal);
    return 0;
  } catch (error) {
    return reportConfiguredFailure(error, state, operation);
  } finally {
    interruption.dispose();
  }
}
