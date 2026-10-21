import { expect } from "bun:test";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { cli } from "./cli.ts";

export const sharedValue =
  "synthetic shared FENCE_RIDER_SYNTHETIC_SECRET_06 \"quoted\" 'value'\n$HOME; $(touch injected); `id`";

export const deploymentSpec = `[project]
name = "fence-rider-test"
revision = "1.0"

[profiles.default]
FORGE_ENVIRONMENT = { description = "Deployment target", default = "staging" }
SHARED = { description = "Shared application value", required = true }
LOCAL_ONLY = { description = "Local application value", required = true }
OPTIONAL = { description = "Absent optional value", required = false }

[scopes.runtime]
secrets = ["SHARED", "OPTIONAL"]
`;

export const deploymentValues = {
  FORGE_ENVIRONMENT: "staging",
  SHARED: sharedValue,
  LOCAL_ONLY: "synthetic local-only",
};

export const deploymentSchema = {
  type: "object",
  properties: {
    FORGE_ENVIRONMENT: { type: "string" },
    SHARED: { type: "string" },
    LOCAL_ONLY: { type: "string" },
    OPTIONAL: { type: ["string", "null"] },
  },
  required: ["FORGE_ENVIRONMENT", "SHARED", "LOCAL_ONLY"],
};

export type ToolCall = {
  tool: string;
  args: string[];
  values: Record<string, string>;
  runtime?: Record<string, string>;
};

export type WorkflowOptions = {
  command?: "deploy" | "lint" | "install" | "uninstall" | "tunnel";
  spec?: string;
  values?: unknown;
  schema?: unknown;
  schemaOutput?: string;
  exportOutput?: string;
  files?: Record<string, string>;
  manifest?: string | null;
  missingTool?: string;
  failStage?: string;
  failKey?: string;
  exitCode?: number;
  failureMode?: "throw" | "signal";
  launchTool?: string;
  blockStage?: string;
  ignoreSignal?: boolean;
  spawnDescendant?: boolean;
  onSpawn?: (
    child: Bun.Subprocess<"ignore", "pipe", "pipe">,
    project: string,
  ) => Promise<void>;
  args?: readonly string[];
  env?: Record<string, string>;
  realSecretSpec?: string;
  dotenv?: string;
};

function writeTool(path: string, tool: string) {
  writeFileSync(
    path,
    `#!${process.execPath}
export const { appendFileSync, writeFileSync } = require("node:fs");
export const args = process.argv.slice(2);
export const tool = ${JSON.stringify(tool)};
export const fixture = JSON.parse(process.env.FIXTURE);
export const names = Object.keys(fixture.schema?.properties ?? {});
appendFileSync(process.env.TOOL_CALL_LOG, JSON.stringify({
  tool, args,
  ...(args[0] === "tunnel" ? { runtime: Object.fromEntries(Object.entries(process.env).filter(([name]) => name.startsWith("FORGE_USER_VAR_")).map(([name, value]) => [name.slice(15), value])) } : {}),
  values: Object.fromEntries(names.filter(name => process.env[name] !== undefined).map(name => [name, process.env[name]]))
}) + "\\n");
if (tool === "secretspec" && process.env.REAL_SECRETSPEC) {
  const result = Bun.spawnSync([process.env.REAL_SECRETSPEC, ...args], { stdout: "pipe", stderr: "pipe" });
  process.stdout.write(result.stdout);
  process.stderr.write(result.stderr);
  process.exit(result.exitCode);
}
if (tool === "secretspec" && args[0] === "run") {
  if (fixture.failStage === "run") process.exit(fixture.exitCode ?? 23);
  const missing = (fixture.schema?.required ?? []).find(name => !Object.hasOwn(fixture.values ?? {}, name));
  if (missing !== undefined) {
    console.error("Secret '" + missing + "' is required but not set");
    process.exit(1);
  }
  const child = Bun.spawnSync(args.slice(args.indexOf("--") + 1), { env: { ...process.env, ...fixture.values }, stdin: "inherit", stdout: "inherit", stderr: "inherit" });
  if (child.signalCode) process.kill(process.pid, child.signalCode);
  process.exit(child.exitCode ?? 1);
}
if (["lint", "install", "uninstall", "tunnel"].includes(args[0])) {
  console.log("synthetic " + args[0] + " result");
  console.error("synthetic " + args[0] + " warning");
  if (process.env.LINT_READ_INPUT) Bun.stdin.text().then(input => {
    console.log("input:" + input);
    console.log("ordinary:" + process.env.ORDINARY_SETTING);
    console.log("auth:" + process.env.FORGE_API_TOKEN);
  });
} else console.error("synthetic helper noise: " + ${JSON.stringify(sharedValue)});
if (fixture.failStage === args[0] && (!fixture.failKey || fixture.failKey === args[5])) {
  if (!["lint", "install", "uninstall", "tunnel"].includes(args[0])) console.log(${JSON.stringify(sharedValue)});
  if (fixture.failureMode === "throw") throw new Error("synthetic error details: " + ${JSON.stringify(sharedValue)});
  if (fixture.failureMode === "signal") process.kill(process.pid, "SIGTERM");
  else process.exit(fixture.exitCode ?? 23);
}
if (fixture.blockStage === args[0]) {
  if (fixture.spawnDescendant) Bun.spawn([process.execPath, "-e", 'process.on("SIGINT", () => {}); process.on("SIGTERM", () => {}); require("node:fs").writeFileSync("descendant-ready", String(process.pid)); setInterval(() => {}, 1000);'], { stdin: "ignore", stdout: "ignore", stderr: "ignore" });
  for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => {
    writeFileSync("received-signal", signal);
    console.error(["lint", "install", "uninstall", "tunnel"].includes(args[0]) ? "synthetic " + args[0] + " interrupted" : "synthetic signal error: " + ${JSON.stringify(sharedValue)});
    if (!fixture.ignoreSignal) process.exit(0);
  });
  setInterval(() => {}, 1000);
  writeFileSync("ready", String(process.pid));
} else if (tool === "secretspec" && args[0] === "check") {
  const scope = args[args.indexOf("--scope") + 1];
  const scopes = Bun.TOML.parse(require("node:fs").readFileSync(process.env.SECRETSPEC_FILE ?? "secretspec.toml", "utf8")).scopes ?? {};
  if (!Object.hasOwn(scopes, scope)) {
    console.error("Invalid scope: '" + scope + "' is not defined in secretspec.toml. Available scopes: " + Object.keys(scopes).join(", "));
    process.exit(1);
  }
  console.log(JSON.stringify({ schema_version: 1, scope, secrets: scopes[scope].secrets.filter(name => names.includes(name)).map(name => ({ name, status: "resolved" })) }));
} else if (tool === "secretspec") console.log((args[0] === "schema" ? fixture.schemaOutput : fixture.exportOutput) ?? JSON.stringify(args[0] === "schema" ? fixture.schema : fixture.values));
`,
    { mode: 0o755 },
  );
}

export function deploymentEnv(project: string, options: WorkflowOptions) {
  return {
    PATH: join(project, "bin"),
    HOME: project,
    XDG_CONFIG_HOME: join(project, "config"),
    XDG_CACHE_HOME: join(project, "cache"),
    // The fake tools are Bun scripts; keep their transpiler cache out of the project.
    BUN_RUNTIME_TRANSPILER_CACHE_PATH: "0",
    XDG_STATE_HOME: join(project, "state"),
    TMPDIR: project,
    TOOL_CALL_LOG: join(project, "tool-calls"),
    FIXTURE: JSON.stringify({
      schema: Object.hasOwn(options, "schema")
        ? options.schema
        : deploymentSchema,
      values: Object.hasOwn(options, "values")
        ? options.values
        : deploymentValues,
      schemaOutput: options.schemaOutput,
      exportOutput: options.exportOutput,
      failStage: options.failStage,
      failKey: options.failKey,
      exitCode: options.exitCode,
      failureMode: options.failureMode,
      blockStage: options.blockStage,
      ignoreSignal: options.ignoreSignal,
      spawnDescendant: options.spawnDescendant,
    }),
    ...(options.realSecretSpec
      ? { REAL_SECRETSPEC: options.realSecretSpec }
      : {}),
    ...options.env,
  };
}

function prepareTools(project: string, options: WorkflowOptions) {
  const bin = join(project, "bin");
  mkdirSync(bin);
  // `secretspec run` starts the install script with `sh`, found on this PATH alone.
  symlinkSync("/bin/sh", join(bin, "sh"));
  for (const tool of ["secretspec", "forge"]) {
    if (options.missingTool === tool) continue;
    writeTool(join(bin, tool), tool);
    if (options.launchTool === tool)
      writeFileSync(
        join(bin, tool),
        `#!${join(project, "missing-interpreter")}\n${sharedValue}\n`,
        { mode: 0o755 },
      );
  }
}

export function prepareProject(options: WorkflowOptions) {
  const project = mkdtempSync(join(cli.workspace, "deployment-"));
  prepareTools(project, options);
  writeFileSync(
    join(project, "secretspec.toml"),
    options.spec ?? deploymentSpec,
  );
  if (options.manifest !== null)
    writeFileSync(
      join(project, "manifest.yml"),
      options.manifest ?? "app: {}\n",
    );
  for (const [name, content] of Object.entries(options.files ?? {}))
    writeFileSync(join(project, name), content);
  if (options.dotenv !== undefined)
    writeFileSync(join(project, "values.env"), options.dotenv);
  return project;
}

async function killFixtureProcess(path: string) {
  if (!existsSync(path)) return;
  const pid = Number(await Bun.file(path).text());
  try {
    process.kill(pid, "SIGKILL");
  } catch {}
}

export async function runWorkflow(options: WorkflowOptions = {}) {
  const project = prepareProject(options);
  const calls = join(project, "tool-calls");
  const child = Bun.spawn(
    [cli.executable, options.command ?? "deploy", ...(options.args ?? [])],
    {
      cwd: project,
      env: deploymentEnv(project, options),
      stdin: "ignore",
      stdout: "pipe",
      stderr: "pipe",
      detached: process.platform !== "win32",
    },
  );
  const output = Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  try {
    await options.onSpawn?.(child, project);
    const [exitCode, stdout, stderr] = await output;
    const interactions: ToolCall[] = existsSync(calls)
      ? (await Bun.file(calls).text())
          .trim()
          .split("\n")
          .map((line) => JSON.parse(line))
      : [];
    expect(stdout + stderr).not.toContain(sharedValue);
    expect(stdout + stderr).not.toContain("FENCE_RIDER_SYNTHETIC_SECRET_06");
    expect(existsSync(join(project, "injected"))).toBe(false);
    return { exitCode, stdout, stderr, interactions, project };
  } finally {
    child.kill("SIGKILL");
    await killFixtureProcess(join(project, "ready"));
    await killFixtureProcess(join(project, "descendant-ready"));
    await child.exited;
  }
}

export const installationSpec = deploymentSpec.replace(
  "[profiles.default]",
  '[profiles.default]\nFORGE_SITE = { description = "Installation site", default = "synthetic.atlassian.net" }\nFORGE_PRODUCT = { description = "Installation product", default = "jira" }',
);

export const installationSchema = {
  ...deploymentSchema,
  properties: {
    ...deploymentSchema.properties,
    FORGE_SITE: { type: "string" },
    FORGE_PRODUCT: { type: "string" },
  },
};

export const installationValues = {
  ...deploymentValues,
  FORGE_SITE: "synthetic.atlassian.net",
  FORGE_PRODUCT: "jira",
};

export function runInstallation(options: WorkflowOptions = {}) {
  return runWorkflow({
    command: "install",
    spec: installationSpec,
    schema: installationSchema,
    values: installationValues,
    ...options,
  });
}

export const realSecretSpec = Bun.which("secretspec");
