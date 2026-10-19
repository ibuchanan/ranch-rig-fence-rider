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
    if (launchError)
      throw new CommandFailure(
        "executable failed to start; check installation",
      );
    if (active.signalCode !== null)
      throw new CommandFailure(`terminated by ${active.signalCode}`);
    if (!Number.isInteger(code) || code < 0 || code > 255)
      throw new CommandFailure("invalid subprocess status");
    if (code !== 0) throw new CommandFailure(`exit status ${code}`, code);
    return stdout;
  } finally {
    // A helper can exit on interruption while its descendants keep running.
    if (signal.aborted) terminate("SIGKILL");
    signal.removeEventListener("abort", interrupt);
    clearTimeout(escalation);
    await active.exited;
  }
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
  const required = schema["required"] === undefined ? [] : schema["required"];
  if (!Array.isArray(required) || new Set(required).size !== required.length)
    throw new Error("Malformed required declarations");
  if (schema["type"] !== "object") throw new Error("Malformed schema type");
  for (const [key, declaration] of Object.entries(properties)) {
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(key))
      throw new Error("Invalid variable name");
    if (
      !isObject(declaration) ||
      (declaration["type"] !== "string" &&
        !(
          Array.isArray(declaration["type"]) &&
          declaration["type"].length === 2 &&
          declaration["type"].includes("string") &&
          declaration["type"].includes("null")
        ))
    ) {
      throw new Error("Unsupported native declaration");
    }
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

/** Synchronize selected encrypted variables, then deploy with secret-safe diagnostics. */
export async function deploy(args: string[] = []): Promise<number> {
  let stage = "environment option validation";
  let target: string | undefined;
  let uploadAttempted = false;
  const interruption = new AbortController();
  const onInterrupt = () => interruption.abort("SIGINT");
  const onTerminate = () => interruption.abort("SIGTERM");
  process.on("SIGINT", onInterrupt);
  process.on("SIGTERM", onTerminate);
  const signal = interruption.signal;
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
    target = explicitTarget;
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
      await run(secretspec, ["schema", ...nativeArgs], signal),
    );
    stage = "SecretSpec resolution";
    const exported: unknown = JSON.parse(
      await run(
        secretspec,
        ["export", ...nativeArgs, "--scope", "", "--format", "json"],
        signal,
      ),
    );
    stage = "resolved value validation";
    const { properties, values } = validateValues(schema, exported);
    target = validateTarget(
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
      uploadAttempted = true;
      console.log(`Fence Rider: ${stage}.`);
      await run(
        forge,
        ["variables", "set", "--encrypt", "--environment", target, key, value],
        signal,
        env,
      );
    }
    stage = `deployment (target ${target})`;
    console.log(`Fence Rider: ${stage}.`);
    await run(
      forge,
      ["deploy", "--environment", target, ...forwarded],
      signal,
      env,
    );
    checkInterruption(signal);
    console.log("Deployment completed.");
    return 0;
  } catch (error) {
    console.error(
      `Fence Rider: ${stage}${target && !stage.includes("(target ") ? ` (target ${target})` : ""} failed${error instanceof CommandFailure ? `: ${error.message}` : ""}. No further commands were run.${uploadAttempted ? " Remote variables may already have changed; no rollback was attempted." : ""}`,
    );
    if (signal.aborted) return signal.reason === "SIGINT" ? 130 : 143;
    return error instanceof CommandFailure && stage.startsWith("deployment (")
      ? error.exitCode
      : 1;
  } finally {
    process.removeListener("SIGINT", onInterrupt);
    process.removeListener("SIGTERM", onTerminate);
  }
}
