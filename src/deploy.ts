import { resolve } from "node:path";

type Specification = {
  project?: { extends?: unknown };
  profiles?: Record<string, Record<string, unknown>>;
  scopes?: Record<string, { secrets: string[] }>;
};

function validateInheritance(config: Specification) {
  const parents = config.project?.extends;
  if (
    parents !== undefined &&
    (!Array.isArray(parents) || parents.length !== 0)
  ) {
    throw new Error("Unsupported inheritance");
  }
}

function validateScopes(config: Specification) {
  const declared = new Set(
    Object.values(config.profiles ?? {}).flatMap((fields) =>
      Object.keys(fields).filter((key) => key !== "defaults"),
    ),
  );
  if (
    config.scopes !== undefined &&
    (typeof config.scopes !== "object" || Array.isArray(config.scopes))
  ) {
    throw new Error("Malformed scopes");
  }
  for (const scope of Object.values(config.scopes ?? {})) {
    if (
      !scope ||
      typeof scope !== "object" ||
      Object.keys(scope).some((key) => key !== "secrets") ||
      !Array.isArray(scope.secrets) ||
      scope.secrets.length === 0 ||
      new Set(scope.secrets).size !== scope.secrets.length ||
      scope.secrets.some(
        (key) => typeof key !== "string" || !key.trim() || !declared.has(key),
      )
    ) {
      throw new Error("Malformed scope");
    }
  }
}

async function run(tool: string, args: string[], env = process.env) {
  const child = Bun.spawn([tool, ...args], {
    env,
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  });
  const [code, stdout] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  if (code !== 0) throw new Error("External command failed");
  return stdout;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function validateValues(schema: unknown, values: unknown) {
  if (
    !isObject(schema) ||
    !isObject(schema["properties"]) ||
    !isObject(values)
  ) {
    throw new Error("Malformed native output");
  }
  const properties = schema["properties"];
  const required = schema["required"] ?? [];
  if (!Array.isArray(required))
    throw new Error("Malformed required declarations");
  for (const key of Object.keys(properties)) {
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(key))
      throw new Error("Invalid variable name");
  }
  for (const key of required) {
    if (
      typeof key !== "string" ||
      !Object.hasOwn(properties, key) ||
      !Object.hasOwn(values, key)
    ) {
      throw new Error("Missing required value");
    }
  }
  for (const [key, value] of Object.entries(values)) {
    if (
      !Object.hasOwn(properties, key) ||
      typeof value !== "string" ||
      value.includes("\u0000")
    ) {
      throw new Error("Unsupported value");
    }
  }
  return { properties, values: values as Record<string, string> };
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
    if (value !== undefined && (value === "" || value.startsWith("-"))) {
      throw new Error("Unsupported Forge positional value");
    }
  }
}

export async function deploy(args: string[] = []): Promise<number> {
  let stage = "environment option validation";
  try {
    let explicitTarget: string | undefined;
    const forwarded: string[] = [];
    for (let index = 0; index < args.length; index++) {
      let arg = args[index] as string;
      if (/^-f+e/.test(arg)) {
        const environmentIndex = arg.indexOf("e");
        forwarded.push(arg.slice(0, environmentIndex));
        arg = `-${arg.slice(environmentIndex)}`;
      }
      if (arg === "--") {
        forwarded.push(...args.slice(index));
        break;
      }
      if (arg === "--help" || /^-f*h$/.test(arg)) {
        console.log(
          "Usage: fence-rider deploy [-e, --environment TARGET] [Forge options]\nTarget: explicit option, resolved FORGE_ENV, then development.\nSecretSpec and Forge must be installed on PATH and authenticated separately.",
        );
        return 0;
      }
      if (arg === "--tag" || /^-f*t$/.test(arg) || arg === "--approve") {
        forwarded.push(arg);
        const value = args[++index];
        if (value !== undefined) forwarded.push(value);
        continue;
      }
      let candidate: string | undefined;
      if (arg === "--environment" || arg === "-e") {
        candidate = args[++index];
        if (candidate === undefined) throw new Error("Missing environment");
      } else if (arg.startsWith("--environment=")) {
        candidate = arg.slice("--environment=".length);
      } else if (arg.startsWith("-e")) {
        candidate = arg.slice(2);
      }
      if (candidate !== undefined) {
        if (explicitTarget !== undefined)
          throw new Error("Duplicate environment");
        explicitTarget = validateTarget(candidate);
      } else {
        forwarded.push(arg);
      }
    }
    const tools: Record<string, string> = {};
    for (const tool of ["secretspec", "forge"]) {
      stage = `${tool} prerequisite (install and authenticate separately on PATH)`;
      const path = Bun.which(tool);
      if (!path) throw new Error("Missing executable");
      tools[tool] = path;
    }
    const secretspec = tools["secretspec"] as string;
    const forge = tools["forge"] as string;
    stage = "configuration";
    const file = resolve(process.env["SECRETSPEC_FILE"] ?? "secretspec.toml");
    const profile = process.env["SECRETSPEC_PROFILE"] ?? "default";
    const config = Bun.TOML.parse(await Bun.file(file).text()) as Specification;
    stage = "project.extends validation (only a single file is supported)";
    validateInheritance(config);
    stage = "scope metadata validation";
    validateScopes(config);
    const nativeArgs = ["--file", file, "--profile", profile];
    stage = "SecretSpec schema";
    const schema: unknown = JSON.parse(
      await run(secretspec, ["schema", ...nativeArgs]),
    );
    stage = "SecretSpec resolution";
    const exported: unknown = JSON.parse(
      await run(secretspec, [
        "export",
        ...nativeArgs,
        "--scope",
        "",
        "--format",
        "json",
      ]),
    );
    stage = "resolved value validation";
    const { properties, values } = validateValues(schema, exported);
    const target = validateTarget(
      explicitTarget ?? values["FORGE_ENV"] ?? "development",
    );
    stage = `manifest validation (target ${target})`;
    if (config.scopes?.["manifest"]) {
      const missing = await validateManifest(
        members(config, "manifest", properties),
      );
      if (missing) {
        stage = `manifest declaration for ${missing} (target ${target})`;
        throw new Error("Missing manifest declaration");
      }
    }
    const env = { ...process.env };
    for (const key of Object.keys(properties)) delete env[key];
    Object.assign(env, values);
    stage = `runtime selection validation (target ${target}; local controls, empty and leading-dash upload values unsupported)`;
    const runtime = members(config, "runtime", properties);
    validateRuntime(runtime, values);
    for (const key of runtime) {
      const value = values[key];
      if (value === undefined) continue;
      stage = `encrypted upload for ${key} (target ${target})`;
      await run(
        forge,
        ["variables", "set", "--encrypt", "--environment", target, key, value],
        env,
      );
    }
    stage = `deployment (target ${target})`;
    await run(forge, ["deploy", "--environment", target, ...forwarded], env);
    console.log("Deployment completed.");
    return 0;
  } catch {
    console.error(
      `Fence Rider: ${stage} failed. No further commands were run.`,
    );
    return 1;
  }
}
