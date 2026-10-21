/** Pure parsing and validation of SecretSpec native output. */

/** The only scopes Fence Rider reads; any other scope belongs to another consumer. */
export const recognizedScopes = ["manifest", "runtime"];

/** Names of declared scopes that Fence Rider never reads. */
export function unrecognizedScopes(scopes: string[]) {
  return scopes.filter((name) => !recognizedScopes.includes(name));
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

/** Keys declared under manifest environment.variables. */
export function manifestKeys(manifest: unknown) {
  const declarations = manifestVariables(manifest);
  if (!Array.isArray(declarations))
    throw new Error("Manifest environment.variables is not a list");
  return new Set(declarations.map(manifestKey));
}

/** Secret names from `secretspec check --json --scope`, a report that never carries values. */
export function parseMembers(report: unknown) {
  const secrets = isObject(report) ? report["secrets"] : undefined;
  if (!Array.isArray(secrets)) throw new Error("Malformed scope report");
  return secrets.map((secret) => {
    const name = isObject(secret) ? secret["name"] : undefined;
    if (typeof name !== "string") throw new Error("Malformed scope report");
    return name;
  });
}

/** Names of required values that `secretspec check --json` reports as unresolved; the report never carries values. */
export function parseUnresolved(report: unknown) {
  const secrets = isObject(report) ? report["secrets"] : undefined;
  if (!Array.isArray(secrets)) throw new Error("Malformed resolution report");
  return secrets.flatMap((secret) => {
    const name = isObject(secret) ? secret["name"] : undefined;
    if (typeof name !== "string")
      throw new Error("Malformed resolution report");
    return secret["status"] === "missing_required" ? [name] : [];
  });
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

/** Names the SecretSpec schema declares, which never carries values. */
export function declaredNames(schema: unknown) {
  if (!isObject(schema)) throw new Error("Malformed schema output");
  return Object.keys(parseProperties(schema));
}

/** Parse the schema and export output together into typed properties and values. */
export function parseResolved(schema: unknown, exported: unknown) {
  if (!isObject(schema)) throw new Error("Malformed schema output");
  if (!isObject(exported)) throw new Error("Malformed export output");
  const properties = parseProperties(schema);
  parseRequired(schema, properties, exported);
  const values: Record<string, string> = {};
  for (const [key, value] of Object.entries(exported))
    values[key] = parseValue(key, value, properties);
  return { properties, values };
}
