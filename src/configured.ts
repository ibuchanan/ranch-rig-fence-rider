import { accessSync, constants } from "node:fs";
import { resolve } from "node:path";
import { capture } from "./process";
import {
  isCompiledBuild,
  locateSecretSpec,
  secretSpecVersion,
  versionBanner,
} from "./secretspec";
import type { Workflow } from "./workflow";

function deliveredSecretSpec(path: string, state: Workflow) {
  state.stage =
    "SecretSpec prerequisite (run fence-rider setup; no global fallback)";
  accessSync(path, constants.X_OK);
  return path;
}

type Specification = {
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

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function manifestVariables(manifest: unknown): unknown {
  if (!isObject(manifest)) return [];
  const environment = manifest["environment"];
  if (!isObject(environment)) return [];
  return environment["variables"] ?? [];
}

function manifestKey(entry: unknown) {
  if (typeof entry === "string") return entry;
  return isObject(entry) ? entry["key"] : undefined;
}

/**
 * Names declared in manifest.yml, read from the working directory (the Forge
 * app root), which need not be the directory holding the SecretSpec file.
 */
async function parseManifestKeys() {
  const declarations = manifestVariables(
    Bun.YAML.parse(await Bun.file("manifest.yml").text()),
  );
  if (!Array.isArray(declarations))
    throw new Error("Manifest environment.variables is not a list");
  return new Set(declarations.map(manifestKey));
}

/** Cross-check optional manifest scope metadata, without limiting local delivery. */
export async function checkManifest(
  config: Specification,
  properties: Record<string, unknown>,
  state: Workflow,
) {
  state.stage = "manifest validation";
  if (!config.scopes?.["manifest"]) return;
  const keys = await parseManifestKeys();
  const missing = members(config, "manifest", properties).find(
    (key) => !keys.has(key),
  );
  if (!missing) return;
  state.stage = `manifest declaration for ${missing}`;
  throw new Error("Manifest declaration is missing");
}

function projectExtends(raw: unknown) {
  const project = isObject(raw) ? raw["project"] : undefined;
  return isObject(project) ? project["extends"] : undefined;
}

function parseInheritance(raw: unknown) {
  const parents = projectExtends(raw);
  if (parents === undefined) return;
  if (!Array.isArray(parents) || parents.length !== 0)
    throw new Error("Unsupported project.extends inheritance");
}

function declaredNames(profiles: unknown) {
  if (profiles === undefined) return new Set<string>();
  if (!isObject(profiles)) throw new Error("Malformed profiles");
  return new Set(
    Object.values(profiles)
      .filter(isObject)
      .flatMap((fields) => Object.keys(fields))
      .filter((key) => key !== "defaults"),
  );
}

function scopeSecrets(scope: unknown) {
  const shaped = isObject(scope) && Object.keys(scope).join() === "secrets";
  const secrets = shaped ? scope["secrets"] : undefined;
  if (!Array.isArray(secrets)) throw new Error("Malformed scope: secrets list");
  return secrets;
}

function isDistinct(items: unknown[]) {
  return items.length > 0 && new Set(items).size === items.length;
}

function isDeclaredName(key: unknown, declared: Set<string>): key is string {
  return typeof key === "string" && key.trim() !== "" && declared.has(key);
}

function parseScope(scope: unknown, declared: Set<string>) {
  const secrets = scopeSecrets(scope);
  if (!isDistinct(secrets))
    throw new Error("Malformed scope: empty or duplicate secrets");
  const names = secrets.filter((key) => isDeclaredName(key, declared));
  if (names.length !== secrets.length)
    throw new Error("Malformed scope: undeclared secret");
  return { secrets: names };
}

/** Parse scope metadata into the supported subset, rejecting everything else. */
function parseScopes(raw: unknown): Specification {
  const root = isObject(raw) ? raw : {};
  const scopes = root["scopes"];
  if (scopes === undefined) return {};
  if (!isObject(scopes)) throw new Error("Malformed scopes");
  const declared = declaredNames(root["profiles"]);
  return {
    scopes: Object.fromEntries(
      Object.entries(scopes).map(([name, scope]) => [
        name,
        parseScope(scope, declared),
      ]),
    ),
  };
}

function isStringType(type: unknown) {
  if (type === "string") return true;
  if (!Array.isArray(type)) return false;
  return (
    type.length === 2 &&
    ["string", "null"].every((member) => type.includes(member))
  );
}

function parseDeclaration(key: string, declaration: unknown) {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(key))
    throw new Error("Invalid variable name");
  if (!isObject(declaration) || !isStringType(declaration["type"]))
    throw new Error("Unsupported schema declaration");
}

function parseProperties(schema: Record<string, unknown>) {
  const properties = schema["properties"];
  if (!isObject(properties)) throw new Error("Malformed schema properties");
  if (schema["type"] !== "object") throw new Error("Malformed schema type");
  for (const [key, declaration] of Object.entries(properties))
    parseDeclaration(key, declaration);
  return properties;
}

function requiredNames(schema: Record<string, unknown>) {
  const required = schema["required"] === undefined ? [] : schema["required"];
  if (!Array.isArray(required) || new Set(required).size !== required.length)
    throw new Error("Malformed required declarations");
  return required;
}

function parseRequired(
  schema: Record<string, unknown>,
  properties: Record<string, unknown>,
  exported: Record<string, unknown>,
) {
  const present = (key: unknown) =>
    typeof key === "string" &&
    Object.hasOwn(properties, key) &&
    Object.hasOwn(exported, key);
  if (!requiredNames(schema).every(present))
    throw new Error("Missing required value");
}

function parseValue(
  key: string,
  value: unknown,
  properties: Record<string, unknown>,
) {
  if (!Object.hasOwn(properties, key))
    throw new Error("Resolved value is not in the schema");
  if (typeof value !== "string" || value.includes("\u0000"))
    throw new Error("Resolved value is not a NUL-free string");
  return value;
}

/** Parse the schema and export output together into typed properties and values. */
function parseResolved(schema: unknown, exported: unknown) {
  if (!isObject(schema)) throw new Error("Malformed schema output");
  if (!isObject(exported)) throw new Error("Malformed export output");
  const properties = parseProperties(schema);
  parseRequired(schema, properties, exported);
  const values: Record<string, string> = {};
  for (const [key, value] of Object.entries(exported))
    values[key] = parseValue(key, value, properties);
  return { properties, values };
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
  const raw: unknown = Bun.TOML.parse(await Bun.file(file).text());
  state.stage = "project.extends validation (only a single file is supported)";
  parseInheritance(raw);
  state.stage = "scope metadata validation";
  const config = parseScopes(raw);
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
  return parseResolved(schema, exported);
}

function forgeEnvironment(
  properties: Record<string, unknown>,
  values: Record<string, string>,
) {
  const env = { ...process.env };
  for (const key of Object.keys(properties)) delete env[key];
  return Object.assign(env, values);
}

function differ(a: string | undefined, b: string | undefined) {
  return a !== undefined && b !== undefined && a !== b;
}

function configuredEnvironment(values: Record<string, string>) {
  const current = values["FORGE_ENVIRONMENT"];
  const legacy = values["FORGE_ENV"];
  if (differ(current, legacy))
    throw new Error("Conflicting environment controls");
  return current ?? legacy;
}

export async function configure(state: Workflow) {
  const located = locateSecretSpec({
    compiled: isCompiledBuild(),
    sourceDir: import.meta.dir,
  });
  const secretspec = located.path
    ? deliveredSecretSpec(located.path, state)
    : prerequisite("secretspec", state);
  if (located.verifyVersion) {
    state.stage = `SecretSpec ${secretSpecVersion} required (rerun fence-rider setup)`;
    const version = await capture(secretspec, ["--version"], state.signal);
    if (version.trim() !== versionBanner)
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
