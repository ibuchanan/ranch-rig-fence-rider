import { resolve } from "node:path";

type Specification = {
  project?: { extends?: unknown };
  profiles?: Record<string, Record<string, unknown>>;
  scopes?: Record<string, { secrets: string[] }>;
};

function validateInheritance({ project = {} }: Specification) {
  const parents = project.extends;
  if (parents === undefined) return;
  if (!Array.isArray(parents) || parents.length !== 0) {
    throw new Error("Unsupported inheritance");
  }
}

function declaredNames(config: Specification) {
  return new Set(
    Object.values(config.profiles ?? {}).flatMap((fields) =>
      Object.keys(fields).filter((key) => key !== "defaults"),
    ),
  );
}

function validateScopes(config: Specification) {
  const scopes = config.scopes;
  if (scopes === undefined) return;
  if (!isObject(scopes)) throw new Error("Malformed scopes");
  const declared = declaredNames(config);
  Object.values(scopes).forEach((scope) => {
    validateScope(scope, declared);
  });
}

function validateScope(scope: unknown, declared: Set<string>) {
  if (!isObject(scope) || Object.keys(scope).some((key) => key !== "secrets"))
    throw new Error("Malformed scope");
  const secrets = scope["secrets"];
  if (!Array.isArray(secrets)) throw new Error("Malformed scope");
  validateScopeSecrets(secrets, declared);
}

function validateScopeSecrets(secrets: unknown[], declared: Set<string>) {
  if (secrets.length === 0 || new Set(secrets).size !== secrets.length)
    throw new Error("Malformed scope");
  if (
    secrets.some(
      (key) => typeof key !== "string" || !key.trim() || !declared.has(key),
    )
  )
    throw new Error("Malformed scope");
}

class CommandFailure extends Error {
  constructor(
    message: string,
    readonly exitCode = 1,
  ) {
    super(message);
  }
}

function checkInterruption(signal: AbortSignal) {
  if (signal.aborted)
    throw new CommandFailure(
      `interrupted by ${signal.reason}`,
      signal.reason === "SIGINT" ? 130 : 143,
    );
}

async function run(
  tool: string,
  args: string[],
  signal: AbortSignal,
  env = process.env,
) {
  checkInterruption(signal);
  let child: Bun.Subprocess<"ignore", "pipe", "ignore">;
  let launchError = false;
  try {
    child = Bun.spawn([tool, ...args], {
      env,
      stdin: "ignore",
      stdout: "pipe",
      stderr: "ignore",
      detached: process.platform !== "win32",
      onExit(_child, _code, _signal, error) {
        launchError = error !== undefined;
      },
    });
  } catch {
    throw new CommandFailure(
      "unable to launch executable; check installation and its interpreter",
    );
  }
  const active = child;
  let escalation: ReturnType<typeof setTimeout> | undefined;
  const terminate = (kind: NodeJS.Signals) => {
    try {
      if (process.platform === "win32") active.kill(kind);
      else process.kill(-active.pid, kind);
    } catch {
      // The process may have exited before the signal was delivered.
    }
  };
  const interrupt = () => {
    terminate(signal.reason);
    escalation ??= setTimeout(() => terminate("SIGKILL"), 1_000);
  };
  signal.addEventListener("abort", interrupt, { once: true });
  try {
    const [code, stdout] = await Promise.all([
      active.exited,
      new Response(active.stdout).text(),
    ]);
    checkInterruption(signal);
    validateProcessExit(code, active.signalCode, launchError);
    return stdout;
  } finally {
    // A helper can exit on interruption while its descendants keep running.
    if (signal.aborted) terminate("SIGKILL");
    signal.removeEventListener("abort", interrupt);
    clearTimeout(escalation);
    await active.exited;
  }
}

function validateProcessExit(
  code: number,
  signal: Bun.Subprocess["signalCode"],
  launchError: boolean,
) {
  if (launchError)
    throw new CommandFailure("executable failed to start; check installation");
  if (signal !== null) throw new CommandFailure(`terminated by ${signal}`);
  validateProcessStatus(code);
}

function isProcessStatus(code: number) {
  return Number.isInteger(code) && code >= 0 && code <= 255;
}

function validateProcessStatus(code: number) {
  if (!isProcessStatus(code))
    throw new CommandFailure("invalid subprocess status");
  if (code !== 0) throw new CommandFailure(`exit status ${code}`, code);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function validateDeclaration(key: string, declaration: unknown) {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(key))
    throw new Error("Invalid variable name");
  if (!isObject(declaration)) throw new Error("Unsupported native declaration");
  if (!isStringType(declaration["type"]))
    throw new Error("Unsupported native declaration");
}

function isStringType(type: unknown) {
  if (type === "string") return true;
  if (!Array.isArray(type)) return false;
  return (
    type.length === 2 &&
    ["string", "null"].every((member) => type.includes(member))
  );
}

function validateRequired(
  required: unknown,
  properties: Record<string, unknown>,
  values: Record<string, unknown>,
) {
  if (!Array.isArray(required) || new Set(required).size !== required.length)
    throw new Error("Malformed required declarations");
  required.forEach((key) => {
    if (
      typeof key !== "string" ||
      !Object.hasOwn(properties, key) ||
      !Object.hasOwn(values, key)
    )
      throw new Error("Missing required value");
  });
}

function validateResolvedValue(
  key: string,
  value: unknown,
  properties: Record<string, unknown>,
) {
  if (!Object.hasOwn(properties, key)) throw new Error("Unsupported value");
  if (typeof value !== "string") throw new Error("Unsupported value");
  if (value.includes("\u0000")) throw new Error("Unsupported value");
}

function validateValues(schema: unknown, values: unknown) {
  if (!isObject(schema) || !isObject(values))
    throw new Error("Malformed native output");
  const properties = validateProperties(schema);
  const required = schema["required"] === undefined ? [] : schema["required"];
  validateRequired(required, properties, values);
  Object.entries(values).forEach(([key, value]) => {
    validateResolvedValue(key, value, properties);
  });
  return { properties, values: values as Record<string, string> };
}

function validateProperties(schema: Record<string, unknown>) {
  const properties = schema["properties"];
  if (!isObject(properties)) throw new Error("Malformed native output");
  if (schema["type"] !== "object") throw new Error("Malformed schema type");
  Object.entries(properties).forEach(([key, declaration]) => {
    validateDeclaration(key, declaration);
  });
  return properties;
}

function validateTarget(target: string) {
  if (
    typeof target !== "string" ||
    !/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(target)
  ) {
    throw new Error("Invalid Forge target");
  }
  return target;
}

function members(
  config: Specification,
  scope: string,
  properties: Record<string, unknown>,
) {
  return (config.scopes?.[scope]?.secrets ?? []).filter((key) =>
    Object.hasOwn(properties, key),
  );
}

async function validateManifest(names: string[]) {
  const manifest = Bun.YAML.parse(await Bun.file("manifest.yml").text()) as {
    environment?: { variables?: (string | { key: string })[] };
  };
  const declarations = manifest?.environment?.variables ?? [];
  if (!Array.isArray(declarations))
    throw new Error("Invalid manifest variables");
  const keys = new Set(
    declarations.map((entry) =>
      typeof entry === "string" ? entry : entry?.key,
    ),
  );
  return names.find((key) => !keys.has(key));
}

function validateRuntime(names: string[], values: Record<string, string>) {
  for (const key of names) {
    if (["FORGE_ENV", "FORGE_SITE", "FORGE_PRODUCT"].includes(key)) {
      throw new Error("Local control cannot be uploaded");
    }
    const value = values[key];
    if (value !== undefined) validateUploadValue(value);
  }
}

function validateUploadValue(value: string) {
  if (value === "" || value.startsWith("-"))
    throw new Error("Unsupported Forge positional value");
}

function normalizeGroupedTarget(arg: string, forwarded: string[]) {
  if (!/^-f+e/.test(arg)) return arg;
  const environmentIndex = arg.indexOf("e");
  forwarded.push(arg.slice(0, environmentIndex));
  return `-${arg.slice(environmentIndex)}`;
}

function takeTarget(arg: string, pending: string[]) {
  if (["--environment", "-e"].includes(arg)) {
    const target = pending.shift();
    if (target === undefined) throw new Error("Missing environment");
    return target;
  }
  return /^(?:--environment=|-e)(.*)$/s.exec(arg)?.[1];
}

function forwardValueOption(
  arg: string,
  pending: string[],
  forwarded: string[],
) {
  if (!(arg === "--tag" || /^-f*t$/.test(arg) || arg === "--approve"))
    return false;
  forwarded.push(arg, ...pending.splice(0, 1));
  return true;
}

function parseDeployArgument(
  arg: string,
  pending: string[],
  options: { explicitTarget?: string; forwarded: string[] },
) {
  if (forwardValueOption(arg, pending, options.forwarded)) return;
  const candidate = takeTarget(arg, pending);
  if (candidate === undefined) {
    options.forwarded.push(arg);
    return;
  }
  if (options.explicitTarget !== undefined)
    throw new Error("Duplicate environment");
  options.explicitTarget = validateTarget(candidate);
}

function parseDeployOptions(args: string[]) {
  const options: {
    explicitTarget?: string;
    forwarded: string[];
    help: boolean;
  } = { forwarded: [], help: false };
  const pending = [...args];
  while (pending.length) {
    const arg = normalizeGroupedTarget(
      pending.shift() as string,
      options.forwarded,
    );
    if (arg === "--") {
      options.forwarded.push(arg, ...pending);
      break;
    }
    if (/^(?:--help|-f*h)$/.test(arg)) {
      options.help = true;
      break;
    }
    parseDeployArgument(arg, pending, options);
  }
  return options;
}

type Deployment = {
  stage: string;
  target: string | undefined;
  uploadAttempted: boolean;
  signal: AbortSignal;
};

function prerequisite(tool: string, state: Deployment) {
  state.stage = `${tool} prerequisite (install and authenticate separately on PATH)`;
  const path = Bun.which(tool);
  if (!path) throw new Error("Missing executable");
  return path;
}

async function readConfiguration(state: Deployment) {
  state.stage = "configuration";
  const file = resolve(process.env["SECRETSPEC_FILE"] ?? "secretspec.toml");
  const profile = process.env["SECRETSPEC_PROFILE"] ?? "default";
  const config = Bun.TOML.parse(await Bun.file(file).text()) as Specification;
  state.stage = "project.extends validation (only a single file is supported)";
  validateInheritance(config);
  state.stage = "scope metadata validation";
  validateScopes(config);
  return { config, nativeArgs: ["--file", file, "--profile", profile] };
}

async function resolveProfile(
  tool: string,
  nativeArgs: string[],
  state: Deployment,
) {
  state.stage = "SecretSpec schema";
  const schema: unknown = JSON.parse(
    await run(tool, ["schema", ...nativeArgs], state.signal),
  );
  state.stage = "SecretSpec resolution";
  const exported: unknown = JSON.parse(
    await run(
      tool,
      ["export", ...nativeArgs, "--scope", "", "--format", "json"],
      state.signal,
    ),
  );
  state.stage = "resolved value validation";
  return validateValues(schema, exported);
}

async function checkManifest(
  config: Specification,
  properties: Record<string, unknown>,
  state: Deployment,
) {
  state.stage = `manifest validation (target ${state.target})`;
  if (!config.scopes?.["manifest"]) return;
  const missing = await validateManifest(
    members(config, "manifest", properties),
  );
  if (!missing) return;
  state.stage = `manifest declaration for ${missing} (target ${state.target})`;
  throw new Error("Missing manifest declaration");
}

function forgeEnvironment(
  properties: Record<string, unknown>,
  values: Record<string, string>,
) {
  const env = { ...process.env };
  for (const key of Object.keys(properties)) delete env[key];
  return Object.assign(env, values);
}

async function uploadRuntime(
  tool: string,
  names: string[],
  env: NodeJS.ProcessEnv,
  state: Deployment,
) {
  for (const key of names) {
    const value = env[key];
    if (value === undefined) continue;
    state.stage = `encrypted upload for ${key} (target ${state.target})`;
    state.uploadAttempted = true;
    console.log(`Fence Rider: ${state.stage}.`);
    await run(
      tool,
      [
        "variables",
        "set",
        "--encrypt",
        "--environment",
        state.target as string,
        key,
        value,
      ],
      state.signal,
      env,
    );
  }
}

async function performDeployment(
  options: ReturnType<typeof parseDeployOptions>,
  state: Deployment,
) {
  state.target = options.explicitTarget;
  const secretspec = prerequisite("secretspec", state);
  const forge = prerequisite("forge", state);
  const { config, nativeArgs } = await readConfiguration(state);
  const { properties, values } = await resolveProfile(
    secretspec,
    nativeArgs,
    state,
  );
  state.target = validateTarget(
    options.explicitTarget ?? values["FORGE_ENV"] ?? "development",
  );
  await checkManifest(config, properties, state);
  const env = forgeEnvironment(properties, values);
  state.stage = `runtime selection validation (target ${state.target}; local controls, empty and leading-dash upload values unsupported)`;
  const runtime = members(config, "runtime", properties);
  validateRuntime(runtime, values);
  await uploadRuntime(forge, runtime, env, state);
  state.stage = `deployment (target ${state.target})`;
  console.log(`Fence Rider: ${state.stage}.`);
  await run(
    forge,
    ["deploy", "--environment", state.target, ...options.forwarded],
    state.signal,
    env,
  );
  checkInterruption(state.signal);
  console.log("Deployment completed.");
}

function failureStage(state: Deployment) {
  if (state.target && !state.stage.includes("(target "))
    return `${state.stage} (target ${state.target})`;
  return state.stage;
}

function reportFailure(error: unknown, state: Deployment) {
  const detail = error instanceof CommandFailure ? `: ${error.message}` : "";
  const warning = state.uploadAttempted
    ? " Remote variables may already have changed; no rollback was attempted."
    : "";
  console.error(
    `Fence Rider: ${failureStage(state)} failed${detail}. No further commands were run.${warning}`,
  );
}

function failureStatus(error: unknown, state: Deployment) {
  if (state.signal.aborted) return state.signal.reason === "SIGINT" ? 130 : 143;
  return deploymentFailureStatus(error, state.stage);
}

function deploymentFailureStatus(error: unknown, stage: string) {
  return error instanceof CommandFailure && stage.startsWith("deployment (")
    ? error.exitCode
    : 1;
}

/** Synchronize selected encrypted variables, then deploy with secret-safe diagnostics. */
export async function deploy(args: string[] = []): Promise<number> {
  const interruption = new AbortController();
  const onInterrupt = () => interruption.abort("SIGINT");
  const onTerminate = () => interruption.abort("SIGTERM");
  process.on("SIGINT", onInterrupt);
  process.on("SIGTERM", onTerminate);
  const state: Deployment = {
    stage: "environment option validation",
    target: undefined,
    uploadAttempted: false,
    signal: interruption.signal,
  };
  try {
    const options = parseDeployOptions(args);
    if (options.help) {
      console.log(
        "Usage: fence-rider deploy [-e, --environment TARGET] [Forge options]\nTarget: explicit option, resolved FORGE_ENV, then development.\nSecretSpec and Forge must be installed on PATH and authenticated separately.",
      );
      return 0;
    }
    await performDeployment(options, state);
    return 0;
  } catch (error) {
    reportFailure(error, state);
    return failureStatus(error, state);
  } finally {
    process.removeListener("SIGINT", onInterrupt);
    process.removeListener("SIGTERM", onTerminate);
  }
}
