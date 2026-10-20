import { accessSync, constants } from "node:fs";
import { resolve } from "node:path";
import { CommandFailure, capture, signalExitCode } from "./process";
import type { Workflow } from "./workflow";

function deliveredSecretSpec(state: Workflow) {
  state.stage =
    "SecretSpec prerequisite (run fence-rider setup; no global fallback)";
  const path = resolve(import.meta.dir, "../.tools/secretspec");
  accessSync(path, constants.X_OK);
  return path;
}

type Specification = {
  project?: { extends?: unknown };
  profiles?: Record<string, Record<string, unknown>>;
  scopes?: Record<string, { secrets: string[] }>;
};

/** Select scope declarations present in the effective native profile schema. */
export function members(
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

/** Cross-check optional manifest scope metadata, without limiting local delivery. */
export async function checkManifest(
  config: Specification,
  properties: Record<string, unknown>,
  state: Workflow,
  context = "",
) {
  state.stage = `manifest validation${context}`;
  if (!config.scopes?.["manifest"]) return;
  const missing = await validateManifest(
    members(config, "manifest", properties),
  );
  if (!missing) return;
  state.stage = `manifest declaration for ${missing}${context}`;
  throw new Error("Missing manifest declaration");
}

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

function prerequisite(tool: string, state: Workflow) {
  state.stage = `${tool} prerequisite (install and authenticate separately on PATH)`;
  const path = Bun.which(tool);
  if (!path) throw new Error("Missing executable");
  return path;
}

async function readConfiguration(state: Workflow) {
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
  state: Workflow,
) {
  state.stage = "SecretSpec schema";
  const schema: unknown = JSON.parse(
    await capture(tool, ["schema", ...nativeArgs], state.signal),
  );
  state.stage = "SecretSpec resolution";
  const exported: unknown = JSON.parse(
    await capture(
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

export function reportConfiguredFailure(
  error: unknown,
  state: Workflow,
  delegatedStage: string,
) {
  const detail = error instanceof CommandFailure ? `: ${error.message}` : "";
  console.error(
    `Fence Rider: ${state.stage} failed${detail}. No further commands were run.`,
  );
  if (state.signal.aborted) return signalExitCode(state.signal.reason);
  return delegatedFailureStatus(error, state.stage === delegatedStage);
}

function delegatedFailureStatus(error: unknown, delegated: boolean) {
  return delegated && error instanceof CommandFailure ? error.exitCode : 1;
}

export async function configure(state: Workflow) {
  const secretspec = import.meta.path.startsWith("/$bunfs/")
    ? prerequisite("secretspec", state)
    : deliveredSecretSpec(state);
  if (!import.meta.path.startsWith("/$bunfs/")) {
    state.stage = "SecretSpec 0.21.1 required (rerun fence-rider setup)";
    const version = await capture(secretspec, ["--version"], state.signal);
    if (version.trim() !== "secretspec 0.21.1")
      throw new Error("Incompatible executable");
  }
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
