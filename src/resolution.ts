/** Pure parsing and validation of SecretSpec configuration and native output. */

export type Specification = {
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

/** Keys declared under manifest environment.variables. */
export function manifestKeys(manifest: unknown) {
  const declarations = manifestVariables(manifest);
  if (!Array.isArray(declarations))
    throw new Error("Manifest environment.variables is not a list");
  return new Set(declarations.map(manifestKey));
}

function projectExtends(raw: unknown) {
  const project = isObject(raw) ? raw["project"] : undefined;
  return isObject(project) ? project["extends"] : undefined;
}

export function parseInheritance(raw: unknown) {
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
export function parseScopes(raw: unknown): Specification {
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
