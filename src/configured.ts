import { resolve } from "node:path";

type Specification = {
  project?: { extends?: unknown };
  profiles?: Record<string, Record<string, unknown>>;
  scopes?: Record<string, { secrets: string[] }>;
};

type ConfigurationState = { stage: string; signal: AbortSignal };

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

export class CommandFailure extends Error {
  constructor(
    message: string,
    readonly exitCode = 1,
  ) {
    super(message);
  }
}

export function checkInterruption(signal: AbortSignal) {
  if (signal.aborted)
    throw new CommandFailure(
      `interrupted by ${signal.reason}`,
      signal.reason === "SIGINT" ? 130 : 143,
    );
}

export async function run(
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

function prerequisite(tool: string, state: ConfigurationState) {
  state.stage = `${tool} prerequisite (install and authenticate separately on PATH)`;
  const path = Bun.which(tool);
  if (!path) throw new Error("Missing executable");
  return path;
}

async function readConfiguration(state: ConfigurationState) {
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
  state: ConfigurationState,
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

function forgeEnvironment(
  properties: Record<string, unknown>,
  values: Record<string, string>,
) {
  const env = { ...process.env };
  for (const key of Object.keys(properties)) delete env[key];
  return Object.assign(env, values);
}

function configuredEnvironment(values: Record<string, string>) {
  const targets = new Set([values["FORGE_ENVIRONMENT"], values["FORGE_ENV"]]);
  targets.delete(undefined);
  if (targets.size > 1) throw new Error("Conflicting environment controls");
  return targets.values().next().value;
}

export async function configure(state: ConfigurationState) {
  const secretspec = prerequisite("secretspec", state);
  const forge = prerequisite("forge", state);
  const { config, nativeArgs } = await readConfiguration(state);
  const { properties, values } = await resolveProfile(
    secretspec,
    nativeArgs,
    state,
  );
  state.stage =
    "environment control validation (FORGE_ENVIRONMENT and FORGE_ENV conflict)";
  const environment = configuredEnvironment(values);
  return {
    forge,
    config,
    properties,
    values,
    environment,
    env: forgeEnvironment(properties, values),
  };
}
