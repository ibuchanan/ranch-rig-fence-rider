import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { cli } from "./cli.ts";
import {
  expectNoInjectedFile,
  expectNoSecretInOutput,
  hostileValue,
  sharedValue,
} from "./guarantees.ts";
import { SpecBuilder } from "./spec.ts";

export { hostileValue, SpecBuilder, sharedValue };

/** The spec most tests use. Tests that need a variation build it from this. */
export const standardSpec = SpecBuilder.standard();

export const deploymentSpec = standardSpec.build();

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
  command?:
    | "variables"
    | "deploy"
    | "lint"
    | "install"
    | "uninstall"
    | "tunnel";
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

/** The fake tool's source; each copy gets a shebang for the Bun running the tests. */
const fakeToolSource = new URL("./fake-tool.ts", import.meta.url);

function writeTool(path: string) {
  writeFileSync(
    path,
    `#!${process.execPath}\n${readFileSync(fakeToolSource, "utf8")}`,
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
      hostile: hostileValue,
    }),
    ...(options.realSecretSpec
      ? { REAL_SECRETSPEC: options.realSecretSpec }
      : {}),
    ...options.env,
  };
}

let shared: { workspace: string; dir: string } | undefined;

/**
 * The fake tools, written once per test workspace and linked into every
 * project. Both are the same source; each learns which tool it is from the
 * name it was written under. macOS scans a freshly written executable on its
 * first exec, which costs about 150ms, so a copy per project made that the
 * bulk of every test's time. The link must be a symlink: runs fail at random
 * when parallel projects exec hard links of one inode.
 */
function sharedTool(tool: string) {
  if (shared?.workspace !== cli.workspace) {
    shared = {
      workspace: cli.workspace,
      dir: mkdtempSync(join(cli.workspace, "fake-tools-")),
    };
  }
  const path = join(shared.dir, tool);
  if (!existsSync(path)) writeTool(path);
  return path;
}

function prepareTools(project: string, options: WorkflowOptions) {
  const bin = join(project, "bin");
  mkdirSync(bin);
  // `secretspec run` starts the install script with `sh`, found on this PATH alone.
  symlinkSync("/bin/sh", join(bin, "sh"));
  // The tunnel script lists ambient prefixed variables with `env | sed`.
  symlinkSync("/usr/bin/env", join(bin, "env"));
  symlinkSync("/usr/bin/sed", join(bin, "sed"));
  for (const tool of ["secretspec", "forge"]) {
    if (options.missingTool === tool) continue;
    if (options.launchTool === tool)
      writeFileSync(
        join(bin, tool),
        `#!${join(project, "missing-interpreter")}\n${hostileValue}\n`,
        { mode: 0o755 },
      );
    else symlinkSync(sharedTool(tool), join(bin, tool));
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

/** Exit status and both output streams of a spawned tool, collected together. */
function collect(child: Bun.Subprocess<"ignore", "pipe", "pipe">) {
  return Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
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
  const child = Bun.spawn(
    [cli.executable, options.command ?? "variables", ...(options.args ?? [])],
    {
      cwd: project,
      env: deploymentEnv(project, options),
      stdin: "ignore",
      stdout: "pipe",
      stderr: "pipe",
      detached: process.platform !== "win32",
    },
  );
  const output = collect(child);
  try {
    await options.onSpawn?.(child, project);
    const [exitCode, stdout, stderr] = await output;
    const interactions = await readInteractions(project);
    const invocation = `fence-rider ${[options.command ?? "variables", ...(options.args ?? [])].join(" ")}`;
    expectNoSecretInOutput(invocation, { stdout, stderr });
    expectNoInjectedFile(invocation, project);
    return { exitCode, stdout, stderr, interactions, project };
  } finally {
    child.kill("SIGKILL");
    await killFixtureProcess(join(project, "ready"));
    await killFixtureProcess(join(project, "descendant-ready"));
    await child.exited;
  }
}

export const installationSpec = standardSpec
  .declare("FORGE_SITE", {
    description: "Installation site",
    default: "synthetic.atlassian.net",
  })
  .declare("FORGE_PRODUCT", {
    description: "Installation product",
    default: "jira",
  });

const installationSchema = {
  ...deploymentSchema,
  properties: {
    ...deploymentSchema.properties,
    FORGE_SITE: { type: "string" },
    FORGE_PRODUCT: { type: "string" },
  },
};

const installationValues = {
  ...deploymentValues,
  FORGE_SITE: "synthetic.atlassian.net",
  FORGE_PRODUCT: "jira",
};

const installationOptions = {
  spec: installationSpec.build(),
  schema: installationSchema,
  values: installationValues,
};

export type ScriptOptions = WorkflowOptions & {
  command: "lint" | "deploy" | "tunnel" | "install" | "uninstall";
  /** Arguments given to `fence-rider <command>`, embedded in the script. */
  generate?: readonly string[];
  /** Arguments a script runner appends after the shell command, arriving as "$@". */
  appended?: readonly string[];
};

function withDefaults(options: ScriptOptions): ScriptOptions {
  return ["install", "uninstall"].includes(options.command)
    ? { ...installationOptions, ...options }
    : options;
}

async function readInteractions(project: string) {
  const calls = join(project, "tool-calls");
  const interactions: ToolCall[] = existsSync(calls)
    ? (await Bun.file(calls).text())
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line))
    : [];
  return interactions;
}

async function finishScript(
  project: string,
  child: Bun.Subprocess<"ignore", "pipe", "pipe">,
) {
  const [exitCode, stdout, stderr] = await collect(child);
  expectNoSecretInOutput("generated script", { stdout, stderr });
  expectNoInjectedFile("generated script", project);
  return {
    exitCode,
    stdout,
    stderr,
    interactions: await readInteractions(project),
    project,
  };
}

/**
 * Generate the script with the compiled CLI, then run it the way a script
 * runner would: `sh -c "$script" sh <appended…>`, with the fake tools on PATH.
 */
export async function runScript(input: ScriptOptions) {
  const options = withDefaults(input);
  const generated = await runWorkflow({
    ...options,
    args: options.generate ?? [],
  });
  if (generated.exitCode !== 0) return { ...generated, generated };
  const child = Bun.spawn(
    ["/bin/sh", "-c", generated.stdout, "sh", ...(options.appended ?? [])],
    {
      cwd: generated.project,
      env: deploymentEnv(generated.project, options),
      stdin: "ignore",
      stdout: "pipe",
      stderr: "pipe",
    },
  );
  return { ...(await finishScript(generated.project, child)), generated };
}

export const realSecretSpec = Bun.which("secretspec");
