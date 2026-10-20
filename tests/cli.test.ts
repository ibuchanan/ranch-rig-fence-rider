import { afterAll, beforeAll, expect, test } from "bun:test";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const workspace = mkdtempSync(join(root, "tmp_rovo_cli-"));
const executable = join(workspace, "fence-rider");

beforeAll(async () => {
  const build = Bun.spawn(
    [
      process.execPath,
      "build",
      "--compile",
      join(root, "src/index.ts"),
      "--outfile",
      executable,
    ],
    { cwd: workspace, stdout: "pipe", stderr: "pipe" },
  );
  const [exitCode, stdout, stderr] = await Promise.all([
    build.exited,
    new Response(build.stdout).text(),
    new Response(build.stderr).text(),
  ]);
  expect({ exitCode, stderr: exitCode === 0 ? "" : stdout + stderr }).toEqual({
    exitCode: 0,
    stderr: "",
  });
}, 30_000);

afterAll(() => rmSync(workspace, { recursive: true, force: true }));

async function invoke(args: readonly string[], toolsAvailable = false) {
  const project = mkdtempSync(join(workspace, "project-"));
  const bin = join(project, "bin");
  const calls = join(project, "tool-calls");
  mkdirSync(bin);
  if (toolsAvailable) {
    for (const tool of ["secretspec", "forge"]) {
      writeFileSync(
        join(bin, tool),
        '#!/bin/sh\nprintf "%s\\n" "$0" >> "$TOOL_CALL_LOG"\nexit 99\n',
        { mode: 0o755 },
      );
    }
  }
  writeFileSync(join(project, "secretspec.toml"), "not valid TOML = [");
  writeFileSync(join(project, "manifest.yml"), "not valid YAML: [");
  const child = Bun.spawn([executable, ...args], {
    cwd: project,
    env: { PATH: bin, HOME: project, TMPDIR: project, TOOL_CALL_LOG: calls },
    stdout: "pipe",
    stderr: "pipe",
  });
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  expect(existsSync(calls)).toBe(false);
  return { exitCode, stdout, stderr };
}

async function packedConsumer() {
  const archive = join(workspace, "fence-rider.tgz");
  const packed = Bun.spawnSync(
    [process.execPath, "pm", "pack", "--ignore-scripts", "--filename", archive],
    { cwd: root, stdout: "pipe", stderr: "pipe" },
  );
  expect(packed.exitCode, packed.stderr.toString()).toBe(0);
  const project = prepareProject({ command: "lint" });
  writeFileSync(
    join(project, "package.json"),
    JSON.stringify({
      private: true,
      scripts: { "forge:lint": "fence-rider lint" },
    }),
  );
  const installed = Bun.spawnSync(
    [process.execPath, "add", "--dev", archive, "--ignore-scripts"],
    {
      cwd: project,
      env: { ...process.env, HOME: project },
      stdout: "pipe",
      stderr: "pipe",
    },
  );
  expect(installed.exitCode, installed.stderr.toString()).toBe(0);
  return project;
}

test("installed package exposes discovery without setup, tools, or configuration", async () => {
  const project = await packedConsumer();
  const bin = join(project, "node_modules", ".bin", "fence-rider");
  expect(existsSync(bin)).toBe(true);
  const { version } = await Bun.file(join(root, "package.json")).json();
  for (const args of [[], ["--help"], ["--version"], ["unsupported"]]) {
    const child = Bun.spawn([bin, ...args], {
      cwd: project,
      env: {
        PATH: process.execPath.slice(0, process.execPath.lastIndexOf("/")),
        HOME: project,
      },
      stdout: "pipe",
      stderr: "pipe",
    });
    const [status, stdout, stderr] = await Promise.all([
      child.exited,
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
    ]);
    expect(status).toBe(args[0] === "unsupported" ? 1 : 0);
    expect(stdout + stderr).toContain(
      args[0] === "--version"
        ? `fence-rider ${version}`
        : args[0] === "unsupported"
          ? "Unknown command"
          : "Usage: fence-rider",
    );
  }
});

test("installed configured invocation rejects missing setup despite an ambient SecretSpec", async () => {
  const project = await packedConsumer();
  const child = Bun.spawn([process.execPath, "run", "forge:lint"], {
    cwd: project,
    env: {
      ...deploymentEnv(project, {}),
      PATH: `${join(project, "bin")}:${process.execPath.slice(0, process.execPath.lastIndexOf("/"))}`,
    },
    stdout: "pipe",
    stderr: "pipe",
  });
  const [status, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  expect(status).toBe(1);
  expect(stdout + stderr).toContain("fence-rider setup");
  expect(existsSync(join(project, "tool-calls"))).toBe(false);
});

test("installed setup rejects unverified installer bytes without executing them", async () => {
  const project = await packedConsumer();
  const server = Bun.serve({
    port: 0,
    fetch: () => new Response("echo UNVERIFIED_INSTALLER_EXECUTED"),
  });
  try {
    const child = Bun.spawn(
      [join(project, "node_modules/.bin/fence-rider"), "setup"],
      {
        cwd: project,
        env: {
          PATH: `${process.execPath.slice(0, process.execPath.lastIndexOf("/"))}:/sbin:/usr/bin:/bin`,
          HOME: project,
          SECRETSPEC_INSTALLER_URL: server.url.href,
        },
        stdout: "pipe",
        stderr: "pipe",
      },
    );
    const [status, stdout, stderr] = await Promise.all([
      child.exited,
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
    ]);
    expect(status).toBe(1);
    expect(stdout + stderr).toContain("installer checksum mismatch");
    expect(stdout + stderr).not.toContain("UNVERIFIED_INSTALLER_EXECUTED");
    expect(
      existsSync(
        join(project, "node_modules/ranch-rig-fence-rider/.tools/secretspec"),
      ),
    ).toBe(false);
  } finally {
    server.stop(true);
  }
});

const secretSpecAssets = process.env["SECRETSPEC_TEST_ASSETS"];

async function setupConsumer(project: string) {
  const server = Bun.serve({
    port: 0,
    fetch(request) {
      const name = new URL(request.url).pathname.slice(1);
      if (!/^secretspec-(installer\.sh|[a-z0-9_-]+\.tar\.xz)$/.test(name))
        return new Response(null, { status: 404 });
      return new Response(Bun.file(join(secretSpecAssets ?? "", name)));
    },
  });
  try {
    const child = Bun.spawn(
      [join(project, "node_modules/.bin/fence-rider"), "setup"],
      {
        cwd: project,
        env: {
          PATH: `${process.execPath.slice(0, process.execPath.lastIndexOf("/"))}:/sbin:/usr/bin:/bin`,
          HOME: project,
          SECRETSPEC_INSTALLER_URL: `${server.url}secretspec-installer.sh`,
          INSTALLER_DOWNLOAD_URL: server.url.href.replace(/\/$/, ""),
        },
        stdout: "pipe",
        stderr: "pipe",
      },
    );
    const [status, stdout, stderr] = await Promise.all([
      child.exited,
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
    ]);
    expect({ status, diagnostic: status ? stdout + stderr : "" }).toEqual({
      status: 0,
      diagnostic: "",
    });
  } finally {
    server.stop(true);
  }
}

test.skipIf(!secretSpecAssets)(
  "installed setup delivers native SecretSpec and configured lint without a global binary",
  async () => {
    const project = await packedConsumer();
    await setupConsumer(project);
    writeFileSync(
      join(project, "secretspec.toml"),
      `[project]\nname = "consumer"\nrevision = "1.0"\n[profiles.default]\nFORGE_ENVIRONMENT = { description = "Target", default = "development" }\nFORGE_SITE = { description = "Site", default = "synthetic.atlassian.net" }\nFORGE_PRODUCT = { description = "Product", default = "jira" }\n`,
    );
    writeFileSync(join(project, "values.env"), "");
    const child = Bun.spawn([process.execPath, "run", "forge:lint"], {
      cwd: project,
      env: {
        ...deploymentEnv(project, {
          schema: {
            properties: {
              FORGE_ENVIRONMENT: {},
              FORGE_SITE: {},
              FORGE_PRODUCT: {},
            },
          },
        }),
        PATH: `${join(project, "bin")}:${process.execPath.slice(0, process.execPath.lastIndexOf("/"))}`,
        SECRETSPEC_PROVIDER: "dotenv:values.env",
      },
      stdout: "pipe",
      stderr: "pipe",
    });
    const [status, stdout, stderr] = await Promise.all([
      child.exited,
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
    ]);
    expect({ status, stdout, stderr }).toEqual({
      status: 0,
      stdout: "synthetic lint result\n",
      stderr: "$ fence-rider lint\nsynthetic lint warning\n",
    });
    const calls = (await Bun.file(join(project, "tool-calls")).text())
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    expect(calls).toEqual([
      {
        tool: "forge",
        args: ["lint"],
        values: {
          FORGE_ENVIRONMENT: "development",
          FORGE_SITE: "synthetic.atlassian.net",
          FORGE_PRODUCT: "jira",
        },
      },
    ]);
    expect(
      readdirSync(join(project, "node_modules/ranch-rig-fence-rider/.tools")),
    ).toEqual(["secretspec"]);
    expect(existsSync(join(project, ".cargo"))).toBe(false);
  },
);

test("installed workflow rejects an incompatible delivered binary before Forge runs", async () => {
  const project = await packedConsumer();
  const directory = join(project, "node_modules/ranch-rig-fence-rider/.tools");
  mkdirSync(directory);
  writeFileSync(
    join(directory, "secretspec"),
    '#!/bin/sh\necho "secretspec 0.1.0"\n',
    { mode: 0o755 },
  );
  const child = Bun.spawn([process.execPath, "run", "forge:lint"], {
    cwd: project,
    env: {
      ...deploymentEnv(project, {}),
      PATH: `${join(project, "bin")}:${process.execPath.slice(0, process.execPath.lastIndexOf("/"))}`,
    },
    stdout: "pipe",
    stderr: "pipe",
  });
  const [status, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  expect(status).toBe(1);
  expect(stdout + stderr).toContain("SecretSpec 0.21.1 required");
  expect(stdout + stderr).not.toContain("0.1.0");
  expect(existsSync(join(project, "tool-calls"))).toBe(false);
});

test.skipIf(process.platform === "win32")(
  "installed setup interruption removes private staging and returns the signal status",
  async () => {
    const project = await packedConsumer();
    let requested = false;
    // Hold the response open so interruption occurs while setup owns its staging directory.
    const stalled = Bun.serve({
      port: 0,
      fetch: async () => {
        requested = true;
        await new Promise((resolve) => setTimeout(resolve, 1000));
        return new Response("pending");
      },
    });
    const child = Bun.spawn(
      [join(project, "node_modules/.bin/fence-rider"), "setup"],
      {
        cwd: project,
        env: {
          PATH: `${process.execPath.slice(0, process.execPath.lastIndexOf("/"))}:/sbin:/usr/bin:/bin`,
          HOME: project,
          SECRETSPEC_INSTALLER_URL: stalled.url.href,
        },
        stdout: "pipe",
        stderr: "pipe",
      },
    );
    try {
      await waitUntil(() => requested, "setup download request");
      child.kill("SIGTERM");
      const [status] = await Promise.all([
        child.exited,
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
      ]);
      expect(status).toBe(143);
      expect(
        readdirSync(join(project, "node_modules/ranch-rig-fence-rider/.tools")),
      ).toEqual([]);
    } finally {
      child.kill("SIGKILL");
      await child.exited;
      stalled.stop(true);
    }
  },
);

test("no command prints help without external tools or valid configuration", async () => {
  const result = await invoke([]);
  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain("Usage: fence-rider");
  expect(result.stderr).toBe("");
});

test.each(["--version", "-V"])(
  "%s prints the package version without tool calls",
  async (flag) => {
    const { version } = await Bun.file(join(root, "package.json")).json();
    for (const toolsAvailable of [false, true]) {
      const result = await invoke([flag], toolsAvailable);
      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim()).toBe(`fence-rider ${version}`);
      expect(result.stderr).toBe("");
    }
  },
);

test.each([
  { args: ["unknown-command"] },
  { args: ["unknown-command", "--help"] },
  { args: ["help", "unknown-command"] },
  { args: ["help", "deploy", "--unknown-option"] },
  { args: ["--unknown-option"] },
])("unknown invocation %j fails without tool calls", async ({ args }) => {
  for (const toolsAvailable of [false, true]) {
    const result = await invoke(args, toolsAvailable);
    expect(result.exitCode).not.toBe(0);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("Unknown command");
    expect(result.stderr).toContain("fence-rider --help");
    expect(result.stderr).toContain("Forge CLI");
  }
});

test.each(["FORGE_ENVIRONMENT", "FORGE_ENV", "FORGE_SITE", "FORGE_PRODUCT"])(
  "configured tunnel rejects runtime selection of %s",
  async (control) => {
    const result = await deploy({
      command: "tunnel",
      spec: deploymentSpec
        .replace(
          "[profiles.default]",
          `[profiles.default]\n${control === "FORGE_ENV" ? "" : `${control} = { description = "Protected control" }`}`,
        )
        .replace('["SHARED", "OPTIONAL"]', `["SHARED", "${control}"]`),
      schema: {
        ...deploymentSchema,
        properties: {
          ...deploymentSchema.properties,
          [control]: { type: "string" },
        },
      },
      values: {
        ...deploymentValues,
        FORGE_ENV: "development",
        [control]: "development",
      },
    });
    expect(result.exitCode).toBe(1);
    expect(result.interactions.filter(({ tool }) => tool === "forge")).toEqual(
      [],
    );
    expect(result.stderr).toContain("tunnel runtime selection validation");
  },
);

test("configured tunnel normalizes explicit named development override and preserves debug payloads", async () => {
  const args = [
    "-d",
    "-f",
    "index.run",
    "other.run",
    "-h",
    "127.0.0.1",
    "-p",
    "9230",
    "--verbose",
    "--",
    "--environment",
    "production",
  ];
  const result = await deploy({
    command: "tunnel",
    args: ["-ealice-dev", ...args],
  });
  expect(result.exitCode).toBe(0);
  expect(result.interactions.at(-1)?.args).toEqual([
    "tunnel",
    "--environment",
    "alice-dev",
    ...args,
  ]);
});

test("configured tunnel rejects reserved prefix declarations rather than losing local values or bypassing selection", async () => {
  const result = await deploy({
    command: "tunnel",
    args: ["-edevelopment"],
    spec: deploymentSpec.replace(
      "[profiles.default]",
      '[profiles.default]\nFORGE_USER_VAR_LOCAL_ONLY = { description = "Collision" }',
    ),
    schema: {
      ...deploymentSchema,
      properties: {
        ...deploymentSchema.properties,
        FORGE_USER_VAR_LOCAL_ONLY: { type: "string" },
      },
    },
    values: {
      ...deploymentValues,
      FORGE_USER_VAR_LOCAL_ONLY: "synthetic collision",
    },
  });
  expect(result.exitCode).toBe(1);
  expect(result.interactions.filter(({ tool }) => tool === "forge")).toEqual(
    [],
  );
  expect(result.stderr).toContain("tunnel runtime selection validation");
  expect(result.stderr).not.toContain("synthetic collision");
});

test.each([
  { args: ["tunnel", "--help"] },
  { args: ["help", "tunnel"] },
  { args: ["tunnel", "-d", "-h", "127.0.0.1", "--help"] },
])(
  "configured tunnel discovery %j never resolves configuration",
  async ({ args }) => {
    for (const toolsAvailable of [false, true]) {
      const result = await invoke(args, toolsAvailable);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("Usage: fence-rider tunnel");
      expect(result.stdout).toContain("FORGE_USER_VAR_");
      expect(result.stdout).toContain("unredacted");
      expect(result.stdout).toContain("-h is debug host");
      expect(result.stderr).toBe("");
    }
  },
);

test("configured tunnel rejects staging before Forge starts", async () => {
  const result = await deploy({ command: "tunnel" });
  expect(result.exitCode).toBe(1);
  expect(result.interactions.filter(({ tool }) => tool === "forge")).toEqual(
    [],
  );
  expect(result.stderr).toContain("tunnel target validation");
  expect(result.stderr).not.toContain("staging");
});

test("configured tunnel maps only explicit runtime members from one resolution without writes", async () => {
  const result = await deploy({
    command: "tunnel",
    values: { ...deploymentValues, FORGE_ENV: "development" },
    env: {
      OPTIONAL: "stale",
      FORGE_USER_VAR_SHARED: "stale shared",
      FORGE_USER_VAR_OPTIONAL: "stale optional",
      FORGE_USER_VAR_LOCAL_ONLY: "unauthorized local",
      FORGE_USER_VAR_UNDECLARED: "unauthorized ambient",
    },
  });
  expect(result.exitCode).toBe(0);
  expect(result.interactions.filter(({ tool }) => tool === "forge")).toEqual([
    {
      tool: "forge",
      args: ["tunnel", "--environment", "development"],
      values: { ...deploymentValues, FORGE_ENV: "development" },
      runtime: { SHARED: sharedValue },
    },
  ]);
  expect(result.interactions.map(({ args }) => args[0])).toEqual([
    "schema",
    "export",
    "tunnel",
  ]);
  expect(result.stdout).toContain("synthetic tunnel result");
  expect(result.stderr).toBe("synthetic tunnel warning\n");
  expect(readdirSync(result.project).sort()).toEqual([
    "bin",
    "manifest.yml",
    "secretspec.toml",
    "tool-calls",
  ]);
});

test.each([
  { args: ["deploy", "--environment", "production", "--help"] },
  { args: ["deploy", "--non-interactive", "-h"] },
  { args: ["deploy", "-fh"] },
])(
  "deployment help with options %j stays side-effect-free",
  async ({ args }) => {
    const result = await invoke(args, true);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Usage: fence-rider deploy");
    expect(result.stderr).toBe("");
  },
);

test("deployment help documents canonical migration without resolving secrets", async () => {
  const result = await invoke(["deploy", "--help"], true);
  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain("FORGE_ENVIRONMENT");
  expect(result.stdout).toContain("FORGE_ENV legacy alias");
  expect(result.stdout).toContain(
    "Conflicting resolved names fail even with an explicit target.",
  );
  expect(result.stderr).toBe("");
});

test("deployment preserves unrelated options and CI arguments without changing boundaries", async () => {
  const forwarded = [
    "--non-interactive",
    "--tag",
    sharedValue,
    "--verbose",
    "--approve",
    "MAJOR_VERSION_RULE",
    "OTHER_RULE",
    "--major-version",
    "4",
    "--inspect",
    "--no-verify",
    "--skip-rollout",
    "--future-option=value",
  ];
  const result = await deploy({
    args: [...forwarded.slice(0, 3), "-e", "production", ...forwarded.slice(3)],
  });
  expect(result.exitCode).toBe(0);
  expect(
    result.interactions
      .filter(({ tool }) => tool === "forge")
      .map(({ args }) => args),
  ).toEqual([
    [
      "variables",
      "set",
      "--encrypt",
      "--environment",
      "production",
      "SHARED",
      sharedValue,
    ],
    ["deploy", "--environment", "production", ...forwarded],
  ]);
});

test.each(["secretspec", "forge"])(
  "missing %s stops before any helper interaction",
  async (missingTool) => {
    const result = await deploy({ missingTool });
    expect(result.exitCode).not.toBe(0);
    expect(result.interactions).toEqual([]);
    expect(result.stderr).toContain(missingTool);
    expect(result.stderr).toContain("PATH");
  },
);

const sharedValue =
  "synthetic shared FENCE_RIDER_SYNTHETIC_SECRET_06 \"quoted\" 'value'\n$HOME; $(touch injected); `id`";
const deploymentSpec = `[project]
name = "fence-rider-test"
revision = "1.0"

[profiles.default]
FORGE_ENV = { description = "Deployment target", default = "staging" }
SHARED = { description = "Shared application value", required = true }
LOCAL_ONLY = { description = "Local application value", required = true }
OPTIONAL = { description = "Absent optional value", required = false }

[scopes.runtime]
secrets = ["SHARED", "OPTIONAL"]
`;
const deploymentValues = {
  FORGE_ENV: "staging",
  SHARED: sharedValue,
  LOCAL_ONLY: "synthetic local-only",
};
const deploymentSchema = {
  type: "object",
  properties: {
    FORGE_ENV: { type: "string" },
    SHARED: { type: "string" },
    LOCAL_ONLY: { type: "string" },
    OPTIONAL: { type: ["string", "null"] },
  },
  required: ["FORGE_ENV", "SHARED", "LOCAL_ONLY"],
};

type ToolCall = {
  tool: string;
  args: string[];
  values: Record<string, string>;
  runtime?: Record<string, string>;
};

type DeployOptions = {
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
const { appendFileSync, writeFileSync } = require("node:fs");
const args = process.argv.slice(2);
const tool = ${JSON.stringify(tool)};
const fixture = JSON.parse(process.env.FIXTURE);
const names = Object.keys(fixture.schema?.properties ?? {});
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
} else if (tool === "secretspec") console.log((args[0] === "schema" ? fixture.schemaOutput : fixture.exportOutput) ?? JSON.stringify(args[0] === "schema" ? fixture.schema : fixture.values));
`,
    { mode: 0o755 },
  );
}

function deploymentEnv(project: string, options: DeployOptions) {
  return {
    PATH: join(project, "bin"),
    HOME: project,
    XDG_CONFIG_HOME: join(project, "config"),
    XDG_CACHE_HOME: join(project, "cache"),
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

function prepareTools(project: string, options: DeployOptions) {
  const bin = join(project, "bin");
  mkdirSync(bin);
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

function prepareProject(options: DeployOptions) {
  const project = mkdtempSync(join(workspace, "deployment-"));
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

async function deploy(options: DeployOptions = {}) {
  const project = prepareProject(options);
  const calls = join(project, "tool-calls");
  const child = Bun.spawn(
    [executable, options.command ?? "deploy", ...(options.args ?? [])],
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

test("deploy resolves once, encrypts only runtime values, then deploys to the configured target", async () => {
  const result = await deploy();
  expect(result.exitCode).toBe(0);
  expect(result.interactions.map(({ tool, args }) => [tool, ...args])).toEqual([
    [
      "secretspec",
      "schema",
      "--file",
      join(result.project, "secretspec.toml"),
      "--profile",
      "default",
    ],
    [
      "secretspec",
      "export",
      "--file",
      join(result.project, "secretspec.toml"),
      "--profile",
      "default",
      "--scope",
      "",
      "--format",
      "json",
    ],
    [
      "forge",
      "variables",
      "set",
      "--encrypt",
      "--environment",
      "staging",
      "SHARED",
      sharedValue,
    ],
    ["forge", "deploy", "--environment", "staging"],
  ]);
  for (const call of result.interactions.filter(
    ({ tool }) => tool === "forge",
  )) {
    expect(call.values).toEqual(deploymentValues);
  }
  expect(result.stdout + result.stderr).not.toContain("synthetic local-only");
  expect(readdirSync(result.project).sort()).toEqual([
    "bin",
    "manifest.yml",
    "secretspec.toml",
    "tool-calls",
  ]);
});

const canonicalSpec = deploymentSpec.replaceAll(
  "FORGE_ENV",
  "FORGE_ENVIRONMENT",
);
const canonicalSchema = {
  ...deploymentSchema,
  properties: {
    FORGE_ENVIRONMENT: { type: "string" },
    SHARED: { type: "string" },
    LOCAL_ONLY: { type: "string" },
    OPTIONAL: { type: ["string", "null"] },
  },
  required: ["FORGE_ENVIRONMENT", "SHARED", "LOCAL_ONLY"],
};
const canonicalValues = {
  FORGE_ENVIRONMENT: "staging",
  SHARED: sharedValue,
  LOCAL_ONLY: "synthetic local-only",
};

test("canonical environment selects the same target for encrypted uploads and one deployment", async () => {
  const result = await deploy({
    spec: canonicalSpec,
    schema: canonicalSchema,
    values: canonicalValues,
  });
  expect(result.exitCode).toBe(0);
  expect(
    result.interactions
      .filter(({ tool }) => tool === "forge")
      .map(({ args }) => args),
  ).toEqual([
    [
      "variables",
      "set",
      "--encrypt",
      "--environment",
      "staging",
      "SHARED",
      sharedValue,
    ],
    ["deploy", "--environment", "staging"],
  ]);
  expect(
    result.interactions
      .filter(({ tool }) => tool === "secretspec")
      .map(({ args }) => args[0]),
  ).toEqual(["schema", "export"]);
  for (const call of result.interactions.filter(
    ({ tool }) => tool === "forge",
  )) {
    expect(call.values).toEqual(canonicalValues);
  }
});

test.each([{ args: [] }, { args: ["--environment", "production"] }])(
  "conflicting environment names fail before Forge even with override %j",
  async ({ args }) => {
    const result = await deploy({
      spec: canonicalSpec.replace(
        "[profiles.default]",
        '[profiles.default]\nFORGE_ENV = { description = "Legacy target" }',
      ),
      schema: {
        ...canonicalSchema,
        properties: {
          ...canonicalSchema.properties,
          FORGE_ENV: { type: "string" },
        },
      },
      values: { ...canonicalValues, FORGE_ENV: "conflicting-synthetic-target" },
      args,
    });
    expect(result.exitCode).not.toBe(0);
    expect(result.interactions.filter(({ tool }) => tool === "forge")).toEqual(
      [],
    );
    expect(result.interactions.map(({ args }) => args[0])).toEqual([
      "schema",
      "export",
    ]);
    expect(result.stderr).toContain("FORGE_ENVIRONMENT and FORGE_ENV conflict");
    expect(result.stdout).toBe("");
    expect(result.stderr).not.toContain("conflicting-synthetic-target");
    expect(result.stderr).not.toContain(
      "Remote variables may already have changed",
    );
  },
);

test.each([
  { name: "canonical", legacy: false, args: ["-e", "production"] },
  { name: "matching dual", legacy: true, args: [] },
  {
    name: "matching dual override",
    legacy: true,
    args: ["--environment=production"],
  },
])(
  "$name environment controls preserve selection and child values",
  async ({ legacy, args }) => {
    const result = await deploy({
      spec: legacy
        ? canonicalSpec.replace(
            "[profiles.default]",
            '[profiles.default]\nFORGE_ENV = { description = "Legacy target" }',
          )
        : canonicalSpec,
      schema: {
        ...canonicalSchema,
        properties: {
          ...canonicalSchema.properties,
          ...(legacy ? { FORGE_ENV: { type: "string" } } : {}),
        },
      },
      values: {
        ...canonicalValues,
        ...(legacy ? { FORGE_ENV: "staging" } : {}),
      },
      args,
    });
    expect(result.exitCode).toBe(0);
    const forge = result.interactions.filter(({ tool }) => tool === "forge");
    expect(
      forge.map(({ args }) => args[args.indexOf("--environment") + 1]),
    ).toEqual(
      args.length ? ["production", "production"] : ["staging", "staging"],
    );
    expect(forge.map(({ args }) => args[0])).toEqual(["variables", "deploy"]);
    expect(forge.at(-1)?.values).toEqual({
      ...canonicalValues,
      ...(legacy ? { FORGE_ENV: "staging" } : {}),
    });
  },
);

test("explicit environment overrides the configured target for every Forge command", async () => {
  const result = await deploy({ args: ["--environment", "production"] });
  expect(result.exitCode).toBe(0);
  expect(
    result.interactions
      .filter(({ tool }) => tool === "forge")
      .map(({ args }) => args),
  ).toEqual([
    [
      "variables",
      "set",
      "--encrypt",
      "--environment",
      "production",
      "SHARED",
      sharedValue,
    ],
    ["deploy", "--environment", "production"],
  ]);
  expect(
    result.interactions
      .filter(({ tool }) => tool === "secretspec")
      .map(({ args }) => args[0]),
  ).toEqual(["schema", "export"]);
});

test.each([
  { args: ["-e", "release_42"] },
  { args: ["--environment=release_42"] },
  { args: ["-erelease_42"] },
])(
  "verified target form %j reaches uploads and deployment",
  async ({ args }) => {
    const result = await deploy({ args });
    expect(result.exitCode).toBe(0);
    expect(
      result.interactions
        .filter(({ tool }) => tool === "forge")
        .map(({ args }) => args),
    ).toEqual([
      [
        "variables",
        "set",
        "--encrypt",
        "--environment",
        "release_42",
        "SHARED",
        sharedValue,
      ],
      ["deploy", "--environment", "release_42"],
    ]);
  },
);

test.each([
  { args: ["--environment"] },
  { args: ["-e"] },
  { args: ["--environment="] },
  { args: ["--environment", ""] },
  { args: ["--environment", "--non-interactive"] },
  { args: ["-e", "--"] },
  { args: ["-e=production"] },
  { args: ["--environment", sharedValue] },
  { args: ["--environment=bad.target"] },
  { args: ["-e", "production", "--environment=staging"] },
  { args: ["--environment=production", "-eproduction"] },
  { args: ["-feproduction", "--environment", "production"] },
])(
  "invalid or duplicate target %j fails before any tool call",
  async ({ args }) => {
    const result = await deploy({ args });
    expect(result.exitCode).not.toBe(0);
    expect(result.interactions).toEqual([]);
    expect(result.stderr).toContain("environment option validation");
    expect(result.stdout).toBe("");
    expect(result.stderr).not.toContain("bad.target");
  },
);

test.each([
  { args: ["--", "--environment", "production", "-e", "other"] },
  { args: ["--tag", "--environment", "--non-interactive"] },
  { args: ["-t", "-e", "--non-interactive"] },
  {
    args: [
      "--tag=--environment=production",
      "--major-version",
      "3",
      "--non-interactive",
    ],
  },
  { args: ["-t--environment=production", "-v3", "--non-interactive"] },
])("target-like payloads remain untouched %j", async ({ args }) => {
  const result = await deploy({ args });
  expect(result.exitCode).toBe(0);
  expect(
    result.interactions
      .filter(({ tool }) => tool === "forge")
      .map(({ args: callArgs }) => callArgs),
  ).toEqual([
    [
      "variables",
      "set",
      "--encrypt",
      "--environment",
      "staging",
      "SHARED",
      sharedValue,
    ],
    ["deploy", "--environment", "staging", ...args],
  ]);
});

test("variadic approval consumes its first required value even when it resembles a target", async () => {
  const result = await deploy({
    args: ["--approve", "--environment", "--non-interactive"],
  });
  expect(result.exitCode).toBe(0);
  expect(result.interactions.at(-1)?.args).toEqual([
    "deploy",
    "--environment",
    "staging",
    "--approve",
    "--environment",
    "--non-interactive",
  ]);
});

test("grouped short flags cannot hide a conflicting deployment target", async () => {
  const result = await deploy({ args: ["-feproduction", "--non-interactive"] });
  expect(result.exitCode).toBe(0);
  expect(
    result.interactions
      .filter(({ tool }) => tool === "forge")
      .map(({ args }) => args),
  ).toEqual([
    [
      "variables",
      "set",
      "--encrypt",
      "--environment",
      "production",
      "SHARED",
      sharedValue,
    ],
    ["deploy", "--environment", "production", "-f", "--non-interactive"],
  ]);
});

test("explicit target precedes the terminator and leaves target-like payloads untouched", async () => {
  const result = await deploy({
    args: [
      "--non-interactive",
      "--environment=production",
      "--",
      "--environment",
      "payload",
    ],
  });
  expect(result.exitCode).toBe(0);
  expect(
    result.interactions
      .filter(({ tool }) => tool === "forge")
      .map(({ args }) => args),
  ).toEqual([
    [
      "variables",
      "set",
      "--encrypt",
      "--environment",
      "production",
      "SHARED",
      sharedValue,
    ],
    [
      "deploy",
      "--environment",
      "production",
      "--non-interactive",
      "--",
      "--environment",
      "payload",
    ],
  ]);
});

test("site and product defaults stay local and never become deployment flags or uploads", async () => {
  const result = await deploy({
    spec: deploymentSpec.replace(
      "[profiles.default]",
      "[profiles.default]\nFORGE_SITE = { required = true }\nFORGE_PRODUCT = { required = true }",
    ),
    schema: {
      ...deploymentSchema,
      properties: {
        ...deploymentSchema.properties,
        FORGE_SITE: { type: "string" },
        FORGE_PRODUCT: { type: "string" },
      },
    },
    values: {
      ...deploymentValues,
      FORGE_SITE: "synthetic.atlassian.net",
      FORGE_PRODUCT: "jira",
    },
    args: ["--non-interactive"],
  });
  expect(result.exitCode).toBe(0);
  expect(
    result.interactions
      .filter(({ tool }) => tool === "forge")
      .map(({ args }) => args),
  ).toEqual([
    [
      "variables",
      "set",
      "--encrypt",
      "--environment",
      "staging",
      "SHARED",
      sharedValue,
    ],
    ["deploy", "--environment", "staging", "--non-interactive"],
  ]);
});

test.each(["FORGE_ENVIRONMENT", "FORGE_ENV", "FORGE_SITE", "FORGE_PRODUCT"])(
  "%s cannot be selected for upload even with an explicit target",
  async (control) => {
    const result = await deploy({
      spec: deploymentSpec
        .replace(
          "[profiles.default]",
          `[profiles.default]\n${control === "FORGE_ENV" ? "" : `${control} = { required = true }`}`,
        )
        .replace('["SHARED", "OPTIONAL"]', `["SHARED", "${control}"]`),
      schema: {
        ...deploymentSchema,
        properties: {
          ...deploymentSchema.properties,
          [control]: { type: "string" },
        },
      },
      values: { ...deploymentValues, [control]: "staging" },
      args: ["-e", "production"],
    });
    expect(result.exitCode).not.toBe(0);
    expect(result.interactions.filter(({ tool }) => tool === "forge")).toEqual(
      [],
    );
    expect(result.stderr).toContain("runtime selection validation");
  },
);

test.each([
  { declaration: 'extends = ["parent.toml"]', context: "project.extends" },
  { declaration: 'extends = "parent.toml"', context: "project.extends" },
  { declaration: "extends = [42]", context: "project.extends" },
])(
  "rejects unsupported or malformed inheritance $declaration before helper interaction",
  async ({ declaration, context }) => {
    const result = await deploy({
      spec: deploymentSpec.replace(
        'revision = "1.0"',
        `revision = "1.0"\n${declaration}`,
      ),
      files: { "parent.toml": deploymentSpec },
    });
    expect(result.exitCode).not.toBe(0);
    expect(result.interactions).toEqual([]);
    expect(result.stderr).toContain(context);
  },
);

test.each([
  "secrets = []",
  'secrets = "SHARED"',
  'secrets = ["SHARED", "SHARED"]',
  'secrets = [" "]',
  "secrets = [42]",
  'secrets = ["UNDECLARED"]',
  'secrets = ["SHARED"]\nextra = true',
])(
  "rejects malformed scope metadata %s before helper interaction",
  async (metadata) => {
    const result = await deploy({
      spec: deploymentSpec.replace(
        'secrets = ["SHARED", "OPTIONAL"]',
        metadata,
      ),
    });
    expect(result.exitCode).not.toBe(0);
    expect(result.interactions).toEqual([]);
    expect(result.stderr).toContain("scope metadata");
  },
);

test.each([
  { name: "null schema", options: { schema: null } },
  { name: "array schema", options: { schema: [] } },
  {
    name: "array properties",
    options: { schema: { type: "object", properties: [] } },
  },
  {
    name: "wrong root type",
    options: { schema: { ...deploymentSchema, type: "array" } },
  },
  {
    name: "null property",
    options: {
      schema: {
        ...deploymentSchema,
        properties: { ...deploymentSchema.properties, OPTIONAL: null },
      },
    },
  },
  {
    name: "numeric property",
    options: {
      schema: {
        ...deploymentSchema,
        properties: {
          ...deploymentSchema.properties,
          OPTIONAL: { type: "number" },
        },
      },
    },
  },
  {
    name: "null required",
    options: { schema: { ...deploymentSchema, required: null } },
  },
  {
    name: "string required",
    options: { schema: { ...deploymentSchema, required: "SHARED" } },
  },
  {
    name: "non-string required",
    options: { schema: { ...deploymentSchema, required: [42] } },
  },
  {
    name: "unknown required",
    options: { schema: { ...deploymentSchema, required: ["UNKNOWN"] } },
  },
  {
    name: "duplicate required",
    options: {
      schema: { ...deploymentSchema, required: ["SHARED", "SHARED"] },
    },
  },
  {
    name: "invalid key",
    options: {
      schema: {
        ...deploymentSchema,
        properties: {
          ...deploymentSchema.properties,
          [sharedValue]: { type: "string" },
        },
      },
    },
  },
  { name: "null export", options: { values: null } },
  { name: "array export", options: { values: [] } },
  { name: "string export", options: { values: sharedValue } },
  { name: "broken schema JSON", options: { schemaOutput: `{${sharedValue}` } },
  { name: "broken export JSON", options: { exportOutput: `{${sharedValue}` } },
])(
  "malformed native output: $name stops before all Forge commands",
  async ({ options }) => {
    const result = await deploy({ ...options, args: ["-e", "production"] });
    expect(result.exitCode).not.toBe(0);
    expect(result.interactions.filter(({ tool }) => tool === "forge")).toEqual(
      [],
    );
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("target production");
    expect(result.stderr).not.toContain("synthetic helper noise");
  },
);

test("preflight failures retain a validated explicit target without leaking invalid values", async () => {
  const result = await deploy({
    args: ["-e", "production"],
    values: { ...deploymentValues, OPTIONAL: { secret: sharedValue } },
  });
  expect(result.exitCode).not.toBe(0);
  expect(result.interactions.filter(({ tool }) => tool === "forge")).toEqual(
    [],
  );
  expect(result.stderr).toContain("resolved value validation");
  expect(result.stderr).toContain("target production");
});

test("validates every resolved value and required declaration before the first upload", async () => {
  for (const values of [
    { ...deploymentValues, OPTIONAL: { secret: sharedValue } },
    { FORGE_ENV: "staging", SHARED: sharedValue },
    { ...deploymentValues, OPTIONAL: "bad\u0000value" },
    { ...deploymentValues, UNDECLARED: sharedValue },
    { ...deploymentValues, FORGE_ENV: "--unsafe-target" },
  ]) {
    const result = await deploy({ values });
    expect(result.exitCode).not.toBe(0);
    expect(result.interactions.filter(({ tool }) => tool === "forge")).toEqual(
      [],
    );
    expect(result.stderr).toContain("validation");
  }
});

test("manifest scope checks declarations including absent optionals before uploads", async () => {
  const spec = `${deploymentSpec}\n[scopes.manifest]\nsecrets = ["SHARED", "OPTIONAL"]\n`;
  const mismatch = await deploy({
    spec,
    manifest: "environment:\n  variables:\n    - SHARED\n",
  });
  expect(mismatch.exitCode).not.toBe(0);
  expect(mismatch.interactions.filter(({ tool }) => tool === "forge")).toEqual(
    [],
  );
  expect(mismatch.stderr).toContain("manifest");
  expect(mismatch.stderr).toContain("OPTIONAL");
  const match = await deploy({
    spec,
    manifest:
      "environment:\n  variables:\n    - SHARED\n    - key: OPTIONAL\n      default: fallback\n",
  });
  expect(match.exitCode).toBe(0);
  expect(match.interactions.at(-1)?.args).toEqual([
    "deploy",
    "--environment",
    "staging",
  ]);
});

test("rejects control-variable upload selection and unsupported runtime inputs before any upload", async () => {
  for (const options of [
    {
      spec: deploymentSpec.replace(
        '["SHARED", "OPTIONAL"]',
        '["SHARED", "FORGE_ENV"]',
      ),
    },
    { values: { ...deploymentValues, OPTIONAL: "" } },
    { values: { ...deploymentValues, OPTIONAL: "--option-like-value" } },
  ]) {
    const result = await deploy(options);
    expect(result.exitCode).not.toBe(0);
    expect(result.interactions.filter(({ tool }) => tool === "forge")).toEqual(
      [],
    );
    expect(result.stderr).toContain("runtime selection");
  }
});

test("resolution, upload, and deployment failures never report success or leak helper output", async () => {
  for (const failStage of ["schema", "export", "variables", "deploy"]) {
    const result = await deploy({ failStage });
    expect(result.exitCode).not.toBe(0);
    expect(result.stdout).not.toContain("Deployment completed");
    expect(result.stderr).not.toContain("synthetic helper noise");
    if (failStage !== "deploy") {
      expect(
        result.interactions.some(
          ({ tool, args }) => tool === "forge" && args[0] === "deploy",
        ),
      ).toBe(false);
    }
    expect(result.stderr).toContain(
      failStage === "schema"
        ? "SecretSpec schema"
        : failStage === "export"
          ? "SecretSpec resolution"
          : "staging",
    );
  }
});

async function waitUntil(check: () => boolean, description: string) {
  const deadline = Date.now() + 4_000;
  while (!check()) {
    if (Date.now() >= deadline)
      throw new Error(`Timed out waiting for ${description}`);
    await Bun.sleep(10);
  }
}

function processRunning(pid: number) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

test.skipIf(process.platform === "win32").each([
  { blockStage: "schema", signal: "SIGINT", ignoreSignal: false },
  { blockStage: "export", signal: "SIGTERM", ignoreSignal: false },
  { blockStage: "variables", signal: "SIGINT", ignoreSignal: false },
  { blockStage: "deploy", signal: "SIGINT", ignoreSignal: false },
  { blockStage: "deploy", signal: "SIGTERM", ignoreSignal: false },
  { blockStage: "deploy", signal: "SIGTERM", ignoreSignal: true },
] as const)(
  "operator interruption $signal during $blockStage cleans up (ignores signal: $ignoreSignal)",
  async ({ blockStage, signal, ignoreSignal }) => {
    const result = await deploy({
      blockStage,
      ignoreSignal,
      args: ["-e", "production"],
      onSpawn: async (child, project) => {
        await waitUntil(
          () => existsSync(join(project, "ready")),
          "active helper readiness",
        );
        const pid = Number(await Bun.file(join(project, "ready")).text());
        child.kill(signal);
        await waitUntil(
          () => child.exitCode !== null || child.signalCode !== null,
          "Fence Rider exit",
        );
        await waitUntil(() => !processRunning(pid), "delegated helper exit");
        expect(await Bun.file(join(project, "received-signal")).text()).toBe(
          signal,
        );
      },
    });
    expect(result.exitCode).toBe(signal === "SIGINT" ? 130 : 143);
    expect(result.stderr).toContain(`interrupted by ${signal}`);
    expect(result.stderr).toContain("target production");
    expect(result.interactions.at(-1)?.args[0]).toBe(blockStage);
    expect(result.stdout).not.toContain("Deployment completed");
    if (["variables", "deploy"].includes(blockStage))
      expect(result.stderr).toContain(
        "Remote variables may already have changed",
      );
  },
  12_000,
);

test.skipIf(process.platform === "win32")(
  "interruption cleans up descendants even when the active helper exits first",
  async () => {
    const result = await deploy({
      blockStage: "deploy",
      spawnDescendant: true,
      onSpawn: async (child, project) => {
        await waitUntil(
          () =>
            existsSync(join(project, "ready")) &&
            existsSync(join(project, "descendant-ready")),
          "process group readiness",
        );
        const parent = Number(await Bun.file(join(project, "ready")).text());
        const descendant = Number(
          await Bun.file(join(project, "descendant-ready")).text(),
        );
        child.kill("SIGTERM");
        await waitUntil(
          () => !processRunning(parent) && !processRunning(descendant),
          "entire delegated process group exit",
        );
        await waitUntil(() => child.exitCode !== null, "Fence Rider exit");
      },
    });
    expect(result.exitCode).toBe(143);
    expect(result.stderr).toContain("interrupted by SIGTERM");
  },
  12_000,
);

test.each(["secretspec", "forge"])(
  "unlaunchable %s executable reports safe actionable context",
  async (launchTool) => {
    const result = await deploy({ launchTool, args: ["-e", "production"] });
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain("unable to launch");
    expect(result.stderr).toContain("executable");
    expect(result.stderr).toContain("target production");
    expect(result.interactions.some(({ tool }) => tool === launchTool)).toBe(
      false,
    );
    expect(result.stdout).not.toContain("Deployment completed");
  },
);

test.each(["schema", "export", "variables", "deploy"])(
  "child signal termination during %s cannot become success",
  async (failStage) => {
    const result = await deploy({
      failStage,
      failureMode: "signal",
      args: ["-e", "production"],
    });
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain("terminated by SIGTERM");
    expect(result.stderr).toContain("target production");
    expect(result.interactions.at(-1)?.args[0]).toBe(failStage);
    expect(result.stdout).not.toContain("Deployment completed");
  },
);

test.each(["schema", "export", "variables", "deploy"])(
  "helper exception during %s never leaks stdout stderr or error details",
  async (failStage) => {
    const result = await deploy({
      failStage,
      failureMode: "throw",
      args: ["-e", "production"],
    });
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain("target production");
    expect(result.interactions.at(-1)?.args[0]).toBe(failStage);
    expect(result.stdout + result.stderr).not.toContain(
      "synthetic error details",
    );
    expect(result.stdout + result.stderr).not.toContain(
      "synthetic helper noise",
    );
  },
);

test("deployment emits safe stage progress without forwarding helper streams", async () => {
  const result = await deploy();
  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain(
    "Fence Rider: encrypted upload for SHARED (target staging).",
  );
  expect(result.stdout).toContain("Fence Rider: deployment (target staging).");
  expect(result.stdout).toContain("Deployment completed.");
  expect(result.stdout + result.stderr).not.toContain("synthetic helper noise");
});

test.each([2, 23, 127, 255])(
  "delegated deployment preserves exit status %i without raw helper output",
  async (exitCode) => {
    const result = await deploy({ failStage: "deploy", exitCode });
    expect(result.exitCode).toBe(exitCode);
    expect(
      result.interactions.filter(({ args }) => args[0] === "deploy"),
    ).toHaveLength(1);
    expect(result.stderr).toContain(`exit status ${exitCode}`);
    expect(result.stderr).toContain("deployment (target staging)");
    expect(result.stderr).toContain(
      "Remote variables may already have changed",
    );
    expect(result.stdout).not.toContain("Deployment completed");
  },
);

test.each(["SHARED", "OPTIONAL"])(
  "failed upload for %s stops later writes and reports possible partial state",
  async (failKey) => {
    const result = await deploy({
      values: { ...deploymentValues, OPTIONAL: "second synthetic value" },
      failStage: "variables",
      failKey,
    });
    expect(result.exitCode).not.toBe(0);
    expect(
      result.interactions
        .filter(({ tool }) => tool === "forge")
        .map(({ args }) => args[5]),
    ).toEqual(failKey === "SHARED" ? ["SHARED"] : ["SHARED", "OPTIONAL"]);
    expect(result.stderr).toContain(`encrypted upload for ${failKey}`);
    expect(result.stderr).toContain("target staging");
    expect(result.stderr).toContain(
      "Remote variables may already have changed",
    );
    expect(result.stdout).not.toContain("Deployment completed");
  },
);

test("omitted runtime scope and empty active-profile intersection deploy without writes or deletion", async () => {
  for (const spec of [
    deploymentSpec.split("[scopes.runtime]")[0],
    `${deploymentSpec.replace('["SHARED", "OPTIONAL"]', '["OTHER_PROFILE_VALUE"]')}\n[profiles.other]\nOTHER_PROFILE_VALUE = { description = "Not active" }\n`,
  ]) {
    const result = await deploy({ spec: spec ?? "" });
    expect(result.exitCode).toBe(0);
    expect(
      result.interactions
        .filter(({ tool }) => tool === "forge")
        .map(({ args }) => args),
    ).toEqual([["deploy", "--environment", "staging"]]);
    expect(
      result.interactions
        .filter(({ tool }) => tool === "secretspec")
        .map(({ args }) => args[0]),
    ).toEqual(["schema", "export"]);
  }
});

test("missing configured target falls back to development for uploads and deployment", async () => {
  const result = await deploy({
    values: { SHARED: sharedValue, LOCAL_ONLY: "synthetic local-only" },
    schema: { ...deploymentSchema, required: ["SHARED", "LOCAL_ONLY"] },
  });
  expect(result.exitCode).toBe(0);
  const forge = result.interactions.filter(({ tool }) => tool === "forge");
  expect(
    forge.map(({ args }) => args[args.indexOf("--environment") + 1]),
  ).toEqual(["development", "development"]);
});

test("empty extends is accepted without changing the single-file deployment", async () => {
  const result = await deploy({
    spec: deploymentSpec.replace(
      'revision = "1.0"',
      'revision = "1.0"\nextends = []',
    ),
  });
  expect(result.exitCode).toBe(0);
  expect(result.interactions.at(-1)?.args).toEqual([
    "deploy",
    "--environment",
    "staging",
  ]);
});

test("all encrypted writes complete before exactly one deployment", async () => {
  const result = await deploy({
    values: { ...deploymentValues, OPTIONAL: "second synthetic value" },
  });
  expect(result.exitCode).toBe(0);
  expect(
    result.interactions
      .filter(({ tool }) => tool === "forge")
      .map(({ args }) => args),
  ).toEqual([
    [
      "variables",
      "set",
      "--encrypt",
      "--environment",
      "staging",
      "SHARED",
      sharedValue,
    ],
    [
      "variables",
      "set",
      "--encrypt",
      "--environment",
      "staging",
      "OPTIONAL",
      "second synthetic value",
    ],
    ["deploy", "--environment", "staging"],
  ]);
});

test("configured lint resolves once, preserves values and arguments, streams results, and never writes", async () => {
  const args = [
    "--fix",
    "--verbose",
    "--approve",
    sharedValue,
    "--",
    "--environment",
    "production",
  ];
  const result = await deploy({
    command: "lint",
    args,
    env: { OPTIONAL: "stale" },
  });
  expect(result.exitCode).toBe(0);
  expect(result.interactions.filter(({ tool }) => tool === "forge")).toEqual([
    { tool: "forge", args: ["lint", ...args], values: deploymentValues },
  ]);
  expect(
    result.interactions
      .filter(({ tool }) => tool === "secretspec")
      .map(({ args }) => args[0]),
  ).toEqual(["schema", "export"]);
  expect(result.stdout).toContain("synthetic lint result");
  expect(result.stderr).toBe("synthetic lint warning\n");
  expect(result.stdout + result.stderr).not.toContain("synthetic helper noise");
});

test("configured lint checks manifest declarations including absent optionals before Forge", async () => {
  const spec = `${deploymentSpec}\n[scopes.manifest]\nsecrets = ["SHARED", "OPTIONAL"]\n`;
  const mismatch = await deploy({
    command: "lint",
    spec,
    manifest: "environment:\n  variables: [SHARED]\n",
  });
  expect(mismatch.exitCode).toBe(1);
  expect(mismatch.interactions.filter(({ tool }) => tool === "forge")).toEqual(
    [],
  );
  expect(mismatch.stderr).toContain("manifest declaration for OPTIONAL");
  const match = await deploy({
    command: "lint",
    spec,
    manifest:
      "environment:\n  variables:\n    - SHARED\n    - key: OPTIONAL\n      default: fallback\n",
  });
  expect(match.exitCode).toBe(0);
  expect(
    match.interactions
      .filter(({ tool }) => tool === "forge")
      .map(({ args }) => args),
  ).toEqual([["lint"]]);
});

test.each([
  { args: ["lint", "--help"] },
  { args: ["lint", "-h"] },
  { args: ["help", "lint"] },
  { args: ["lint", "--fix", "--help"] },
])("configured lint discovery %j never invokes tools", async ({ args }) => {
  const result = await invoke(args, true);
  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain("lint");
  expect(result.stdout).toContain("unredacted");
  expect(result.stderr).toBe("");
});

test.each(["SHARED", "LOCAL_ONLY", "FORGE_ENV"])(
  "configured lint requires the whole profile including %s",
  async (missing) => {
    const values: Record<string, string> = { ...deploymentValues };
    delete values[missing];
    const result = await deploy({
      command: "lint",
      values,
      env: { SECRETSPEC_SCOPE: "manifest" },
    });
    expect(result.exitCode).toBe(1);
    expect(result.interactions.filter(({ tool }) => tool === "forge")).toEqual(
      [],
    );
    expect(result.stderr).toContain("resolved value validation");
  },
);

test.each([2, 23, 127, 255])(
  "configured lint preserves Forge status %i and useful diagnostics",
  async (exitCode) => {
    const result = await deploy({
      command: "lint",
      failStage: "lint",
      exitCode,
    });
    expect(result.exitCode).toBe(exitCode);
    expect(result.stdout).toContain("synthetic lint result");
    expect(result.stderr).toContain("synthetic lint warning");
    expect(result.stderr).toContain(`lint failed: exit status ${exitCode}`);
    expect(result.interactions.at(-1)?.args).toEqual(["lint"]);
  },
);

test.each(["schema", "export"])(
  "configured lint keeps failing %s output private",
  async (failStage) => {
    const result = await deploy({ command: "lint", failStage });
    expect(result.exitCode).toBe(1);
    expect(result.interactions.filter(({ tool }) => tool === "forge")).toEqual(
      [],
    );
    expect(result.stderr).toContain("SecretSpec");
    expect(result.stderr).not.toContain("synthetic helper noise");
  },
);

test.each(["secretspec", "forge"])(
  "configured lint fails safely for unlaunchable %s",
  async (launchTool) => {
    const result = await deploy({ command: "lint", launchTool });
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("executable");
    expect(result.interactions.some(({ tool }) => tool === launchTool)).toBe(
      false,
    );
  },
);

test("configured lint treats child signal termination as failure", async () => {
  const result = await deploy({
    command: "lint",
    failStage: "lint",
    failureMode: "signal",
  });
  expect(result.exitCode).toBe(1);
  expect(result.stderr).toContain("terminated by SIGTERM");
});

test("configured lint without manifest scope needs no manifest and preserves target-like payloads", async () => {
  const args = ["--approve", "--help", "--", "-h"];
  const result = await deploy({ command: "lint", manifest: null, args });
  expect(result.exitCode).toBe(0);
  expect(
    result.interactions
      .filter(({ tool }) => tool === "forge")
      .map(({ args }) => args),
  ).toEqual([["lint", ...args]]);
  expect(result.interactions.at(-1)?.values).toEqual(deploymentValues);
});

test.each(["lint", "install", "uninstall", "tunnel"] as const)(
  "configured %s streams before exit and inherits input, ordinary settings, and authentication without redaction",
  async (command) => {
    const options: DeployOptions = {
      ...(command === "install" || command === "uninstall"
        ? {
            spec: installationSpec,
            schema: installationSchema,
            values: installationValues,
          }
        : {}),
      env: {
        LINT_READ_INPUT: "1",
        ORDINARY_SETTING: "synthetic-setting",
        FORGE_API_TOKEN: "synthetic-auth",
      },
    };
    if (command === "tunnel") options.args = ["-edevelopment"];
    const project = prepareProject(options);
    const child = Bun.spawn([executable, command, ...(options.args ?? [])], {
      cwd: project,
      env: deploymentEnv(project, options),
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe",
    });
    let stdout = "";
    const output = (async () => {
      for await (const chunk of child.stdout)
        stdout += new TextDecoder().decode(chunk);
    })();
    const errors = new Response(child.stderr).text();
    try {
      await waitUntil(
        () => stdout.includes(`synthetic ${command} result`),
        `live ${command} output before input`,
      );
      expect(child.exitCode).toBeNull();
      child.stdin.write(sharedValue);
      child.stdin.end();
      expect(await child.exited).toBe(0);
      await output;
      expect(stdout).toContain(`input:${sharedValue}`);
      expect(stdout).toContain("ordinary:synthetic-setting");
      expect(stdout).toContain("auth:synthetic-auth");
      expect(await errors).toBe(`synthetic ${command} warning\n`);
    } finally {
      child.stdin.end();
      child.kill("SIGKILL");
      await child.exited;
      await output;
      await errors;
    }
  },
);

test.skipIf(process.platform === "win32").each([
  {
    blockStage: "schema",
    signal: "SIGINT",
    ignoreSignal: false,
    spawnDescendant: false,
  },
  {
    blockStage: "export",
    signal: "SIGTERM",
    ignoreSignal: false,
    spawnDescendant: false,
  },
  {
    blockStage: "lint",
    signal: "SIGINT",
    ignoreSignal: false,
    spawnDescendant: true,
  },
  {
    blockStage: "lint",
    signal: "SIGTERM",
    ignoreSignal: true,
    spawnDescendant: true,
  },
] as const)(
  "configured lint interruption $signal at $blockStage cleans up the active process group",
  async ({ blockStage, signal, ignoreSignal, spawnDescendant }) => {
    const result = await deploy({
      command: "lint",
      blockStage,
      ignoreSignal,
      spawnDescendant,
      onSpawn: async (child, project) => {
        await waitUntil(
          () =>
            existsSync(join(project, "ready")) &&
            (!spawnDescendant || existsSync(join(project, "descendant-ready"))),
          "lint process readiness",
        );
        const pid = Number(await Bun.file(join(project, "ready")).text());
        const descendant = spawnDescendant
          ? Number(await Bun.file(join(project, "descendant-ready")).text())
          : undefined;
        child.kill(signal);
        await waitUntil(
          () => child.exitCode !== null || child.signalCode !== null,
          "interrupted wrapper exit",
        );
        await waitUntil(
          () =>
            !processRunning(pid) &&
            (descendant === undefined || !processRunning(descendant)),
          "lint process group cleanup",
        );
        expect(await Bun.file(join(project, "received-signal")).text()).toBe(
          signal,
        );
      },
    });
    expect(result.exitCode).toBe(signal === "SIGINT" ? 130 : 143);
    expect(result.stderr).toContain(`interrupted by ${signal}`);
    expect(result.interactions.at(-1)?.args[0]).toBe(blockStage);
    expect(result.stderr).not.toContain(
      "Remote variables may already have changed",
    );
  },
  12_000,
);

test
  .skipIf(process.platform === "win32")
  .each(
    (["install", "uninstall"] as const).flatMap((command) =>
      (["SIGINT", "SIGTERM"] as const).map((signal) => ({ command, signal })),
    ),
  )(
  "configured $command interruption $signal cleans ignoring helpers and descendants",
  async ({ command, signal }) => {
    const result = await install({
      command,
      blockStage: command,
      ignoreSignal: true,
      spawnDescendant: true,
      onSpawn: async (child, project) => {
        await waitUntil(
          () =>
            existsSync(join(project, "ready")) &&
            existsSync(join(project, "descendant-ready")),
          "installation readiness",
        );
        const pid = Number(await Bun.file(join(project, "ready")).text());
        const descendant = Number(
          await Bun.file(join(project, "descendant-ready")).text(),
        );
        child.kill(signal);
        await waitUntil(
          () =>
            child.exitCode !== null &&
            !processRunning(pid) &&
            !processRunning(descendant),
          "installation process group cleanup",
        );
        expect(await Bun.file(join(project, "received-signal")).text()).toBe(
          signal,
        );
      },
    });
    expect(result.exitCode).toBe(signal === "SIGINT" ? 130 : 143);
    expect(result.stderr).toContain(`interrupted by ${signal}`);
    expect(
      result.interactions
        .filter(({ tool }) => tool === "forge")
        .map(({ args }) => args[0]),
    ).toEqual([command]);
  },
  12_000,
);

const installationSpec = canonicalSpec.replace(
  "[profiles.default]",
  '[profiles.default]\nFORGE_SITE = { description = "Installation site", default = "synthetic.atlassian.net" }\nFORGE_PRODUCT = { description = "Installation product", default = "jira" }',
);
const installationSchema = {
  ...canonicalSchema,
  properties: {
    ...canonicalSchema.properties,
    FORGE_SITE: { type: "string" },
    FORGE_PRODUCT: { type: "string" },
  },
};
const installationValues = {
  ...canonicalValues,
  FORGE_SITE: "synthetic.atlassian.net",
  FORGE_PRODUCT: "jira",
};

function install(options: DeployOptions = {}) {
  return deploy({
    command: "install",
    spec: installationSpec,
    schema: installationSchema,
    values: installationValues,
    ...options,
  });
}

test.each(
  [
    ["uninstall", "--help"],
    ["uninstall", "-h"],
    ["help", "uninstall"],
    ["uninstall", "--verbose", "--help"],
  ].map((args) => ({ args })),
)(
  "configured uninstall help %j stays configuration-free and documents its own policy",
  async ({ args }) => {
    const result = await invoke(args, true);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Usage: fence-rider uninstall");
    expect(result.stdout).toContain("FORGE_SITE");
    expect(result.stdout).toContain("remote installation state");
    expect(result.stdout).toContain("does not support --non-interactive");
    expect(result.stdout).toContain("unredacted");
    expect(result.stderr).toBe("");
  },
);

test("configured uninstall preserves installation-id payloads rather than consuming target-like values", async () => {
  const args = [
    "--verbose",
    "--installation-id",
    "--site",
    "-i",
    "--environment",
    "--app-id-override",
    "--product",
    "--",
    "--site",
    "payload",
    "--help",
  ];
  const result = await install({ command: "uninstall", args });
  expect(result.exitCode).toBe(0);
  expect(
    result.interactions
      .filter(({ tool }) => tool === "forge")
      .map(({ args }) => args),
  ).toEqual([
    [
      "uninstall",
      "--environment",
      "staging",
      "--site",
      "synthetic.atlassian.net",
      "--product",
      "jira",
      ...args,
    ],
  ]);
});

test.each([2, 23, 127, 255])(
  "configured uninstall preserves numeric status %i with uninstall-specific diagnostics",
  async (exitCode) => {
    const result = await install({
      command: "uninstall",
      failStage: "uninstall",
      exitCode,
    });
    expect(result.exitCode).toBe(exitCode);
    expect(result.stderr).toContain(
      `uninstallation failed: exit status ${exitCode}`,
    );
    expect(result.stdout).toContain("synthetic uninstall result");
    expect(
      result.interactions
        .filter(({ tool }) => tool === "forge")
        .map(({ args }) => args[0]),
    ).toEqual(["uninstall"]);
  },
);

test.each([
  {
    args: ["-e", "production", "--verbose"],
    target: ["production", "synthetic.atlassian.net", "jira"],
    forwarded: ["--verbose"],
  },
  {
    args: ["--site", "other.atlassian.net"],
    target: ["staging", "other.atlassian.net", "jira"],
  },
  {
    args: ["-p", "confluence"],
    target: ["staging", "synthetic.atlassian.net", "confluence"],
  },
  {
    args: [
      "--environment=release_42",
      "--site=https://other.atlassian.net",
      "--product=compass",
    ],
    target: ["release_42", "https://other.atlassian.net", "compass"],
  },
  {
    args: [
      "-eproduction",
      "-shttps://bitbucket.org/synthetic/",
      "-pbitbucket",
      "--batch",
    ],
    target: ["production", "https://bitbucket.org/synthetic/", "bitbucket"],
    forwarded: ["--batch"],
  },
  {
    args: [
      "--installation-id=--site",
      "-i--environment",
      "--app-id-override=--product",
      "--verbose",
    ],
    target: ["staging", "synthetic.atlassian.net", "jira"],
    forwarded: [
      "--installation-id=--site",
      "-i--environment",
      "--app-id-override=--product",
      "--verbose",
    ],
  },
  {
    args: ["--installation-id", "--help", "--", "-h"],
    target: ["staging", "synthetic.atlassian.net", "jira"],
    forwarded: ["--installation-id", "--help", "--", "-h"],
  },
])(
  "configured uninstall preserves verified target and argument forms %j",
  async ({ args, target, forwarded = [] }) => {
    const result = await install({ command: "uninstall", args });
    expect(result.exitCode).toBe(0);
    expect(
      result.interactions
        .filter(({ tool }) => tool === "forge")
        .map(({ args }) => args),
    ).toEqual([
      [
        "uninstall",
        "--environment",
        target[0],
        "--site",
        target[1],
        "--product",
        target[2],
        ...forwarded,
      ],
    ]);
  },
);

test.each(
  [
    ["--site"],
    ["--product"],
    ["--environment"],
    ["--site="],
    ["-p", ""],
    ["-e=production"],
    ["-s=other.atlassian.net"],
    ["-p=jira"],
    ["--site", "--verbose"],
    ["--site", "not a site"],
    ["--site", "https://user:pass@example.atlassian.net"],
    ["--site", "file:///tmp/site"],
    ["--product", "jsm"],
    ["--environment", "bad.target"],
    ["--site", "one.atlassian.net", "-stwo.atlassian.net"],
    ["-pjira", "--product=jira"],
    ["-eproduction", "--environment", "staging"],
  ].map((args) => ({ args })),
)(
  "configured uninstall rejects invalid and duplicate targets %j before tools",
  async ({ args }) => {
    const result = await install({ command: "uninstall", args });
    expect(result.exitCode).toBe(1);
    expect(result.interactions).toEqual([]);
    expect(result.stderr).toContain("uninstallation option validation");
  },
);

test.each(["FORGE_SITE", "FORGE_PRODUCT"])(
  "configured uninstall rejects absent effective %s without prompting",
  async (missing) => {
    const values: Record<string, string> = { ...installationValues };
    delete values[missing];
    const result = await install({ command: "uninstall", values });
    expect(result.exitCode).toBe(1);
    expect(result.interactions.filter(({ tool }) => tool === "forge")).toEqual(
      [],
    );
    expect(result.stderr).toContain("uninstallation target validation");
  },
);

test.each([
  { failStage: "schema" },
  { failStage: "export" },
  { launchTool: "secretspec" },
  { launchTool: "forge" },
  { missingTool: "secretspec" },
  { missingTool: "forge" },
  { failStage: "uninstall", failureMode: "signal" as const },
])(
  "configured uninstall fails safely without follow-up commands %j",
  async (options) => {
    const result = await install({ ...options, command: "uninstall" });
    expect(result.exitCode).toBe(1);
    expect(
      result.interactions
        .filter(({ tool }) => tool === "forge")
        .map(({ args }) => args[0]),
    ).toEqual(options.failStage === "uninstall" ? ["uninstall"] : []);
    expect(result.stderr).not.toContain("synthetic helper noise");
    if (options.failureMode === "signal")
      expect(result.stderr).toContain("terminated by SIGTERM");
  },
);

test("configured uninstall ignores deployment-only checks and needs no manifest even with runtime members", async () => {
  const result = await install({
    command: "uninstall",
    manifest: null,
    spec: `${installationSpec.replace('["SHARED", "OPTIONAL"]', '["FORGE_SITE", "SHARED"]')}\n[scopes.manifest]\nsecrets = ["SHARED", "OPTIONAL"]\n`,
    values: { ...installationValues, OPTIONAL: "--local-only" },
  });
  expect(result.exitCode).toBe(0);
  expect(
    result.interactions
      .filter(({ tool }) => tool === "forge")
      .map(({ args }) => args[0]),
  ).toEqual(["uninstall"]);
});

test("configured uninstall resolves once and delegates only uninstall with full local values and target defaults", async () => {
  const result = await install({
    command: "uninstall",
    env: { OPTIONAL: "stale" },
  });
  expect(result.exitCode).toBe(0);
  expect(result.interactions.filter(({ tool }) => tool === "forge")).toEqual([
    {
      tool: "forge",
      args: [
        "uninstall",
        "--environment",
        "staging",
        "--site",
        "synthetic.atlassian.net",
        "--product",
        "jira",
      ],
      values: installationValues,
    },
  ]);
  expect(
    result.interactions
      .filter(({ tool }) => tool === "secretspec")
      .map(({ args }) => args[0]),
  ).toEqual(["schema", "export"]);
});

test("configured installation resolves once and delegates only install with full local values and target defaults", async () => {
  const result = await install({ env: { OPTIONAL: "stale" } });
  expect(result.exitCode).toBe(0);
  expect(result.interactions.filter(({ tool }) => tool === "forge")).toEqual([
    {
      tool: "forge",
      args: [
        "install",
        "--environment",
        "staging",
        "--site",
        "synthetic.atlassian.net",
        "--product",
        "jira",
      ],
      values: installationValues,
    },
  ]);
  expect(
    result.interactions
      .filter(({ tool }) => tool === "secretspec")
      .map(({ args }) => args[0]),
  ).toEqual(["schema", "export"]);
  expect(result.stdout).toContain("synthetic install result");
  expect(result.stderr).toBe("synthetic install warning\n");
});

test("configured installation overrides targets independently and preserves explicit upgrade policy", async () => {
  const result = await install({
    args: [
      "--verbose",
      "-sother.atlassian.net",
      "--upgrade",
      "code",
      "--confirm-scopes",
      "--non-interactive",
    ],
  });
  expect(result.exitCode).toBe(0);
  expect(
    result.interactions
      .filter(({ tool }) => tool === "forge")
      .map(({ args }) => args),
  ).toEqual([
    [
      "install",
      "--environment",
      "staging",
      "--site",
      "other.atlassian.net",
      "--product",
      "jira",
      "--verbose",
      "--upgrade",
      "code",
      "--confirm-scopes",
      "--non-interactive",
    ],
  ]);
});

test.each([
  {
    args: [
      "--app-id-override",
      "--site",
      "--upgrade",
      "code",
      "--license-modes",
      "user-access",
      "--users-with-access",
      "synthetic-user",
      "--major-version",
      "--environment",
      "--unitId",
      "--product",
    ],
  },
  {
    args: [
      "--license",
      "active",
      "--app-id-override=--site",
      "-ltrial",
      "--upgrade=all",
      "--",
      "--site",
      "payload",
      "-p",
      "confluence",
      "--help",
    ],
  },
])(
  "configured installation preserves target-like option payloads and terminators %j",
  async ({ args }) => {
    const result = await install({ args });
    expect(result.exitCode).toBe(0);
    expect(
      result.interactions
        .filter(({ tool }) => tool === "forge")
        .map(({ args }) => args),
    ).toEqual([
      [
        "install",
        "--environment",
        "staging",
        "--site",
        "synthetic.atlassian.net",
        "--product",
        "jira",
        ...args,
      ],
    ]);
  },
);

test.each(
  [
    ["--site"],
    ["-s=synthetic.atlassian.net"],
    ["-dsother.atlassian.net"],
    ["--demo-site=true"],
    ["-p"],
    ["--environment="],
    ["--site", ""],
    ["--site", "--non-interactive"],
    ["-p=jira"],
    ["--product", "jsm"],
    ["--environment", "bad.target"],
    ["--site", "not a site"],
    ["--site", "one.atlassian.net", "-stwo.atlassian.net"],
    ["-pjira", "--product=jira"],
    ["-eproduction", "--environment", "staging"],
    ["--demo-site"],
    ["-d"],
  ].map((args) => ({ args })),
)(
  "configured installation rejects invalid or duplicate explicit targets %j before tools",
  async ({ args }) => {
    const result = await install({ args });
    expect(result.exitCode).toBe(1);
    expect(result.interactions).toEqual([]);
    expect(result.stderr).toContain("installation option validation");
  },
);

test.each(["FORGE_SITE", "FORGE_PRODUCT"])(
  "configured installation rejects absent effective %s without prompting",
  async (missing) => {
    const values: Record<string, string> = { ...installationValues };
    delete values[missing];
    const result = await install({ values });
    expect(result.exitCode).toBe(1);
    expect(result.interactions.filter(({ tool }) => tool === "forge")).toEqual(
      [],
    );
    expect(result.stderr).toContain("installation target validation");
  },
);

test.each(
  [
    ["install", "--help"],
    ["install", "-h"],
    ["help", "install"],
    ["install", "--upgrade", "--help"],
    ["install", "--license-modes", "user-access", "--help"],
  ].map((args) => ({ args })),
)(
  "configured installation help %j stays configuration-free",
  async ({ args }) => {
    const result = await invoke(args, true);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("install");
    expect(result.stdout).toContain("FORGE_SITE");
    expect(result.stdout).toContain("unredacted");
    expect(result.stderr).toBe("");
  },
);

test.each([
  {
    args: ["-upconfluence"],
    target: ["staging", "synthetic.atlassian.net", "jira"],
    forwarded: ["-upconfluence"],
  },
  {
    args: ["-u", "--app-id-override", "--help"],
    target: ["staging", "synthetic.atlassian.net", "jira"],
    forwarded: ["-u", "--app-id-override", "--help"],
  },
  {
    args: ["-e", "production"],
    target: ["production", "synthetic.atlassian.net", "jira"],
  },
  {
    args: [
      "--environment=production",
      "--site=https://other.atlassian.net",
      "--product=confluence",
    ],
    target: ["production", "https://other.atlassian.net", "confluence"],
  },
  {
    args: ["-eproduction", "-shttps://bitbucket.org/synthetic/", "-pbitbucket"],
    target: ["production", "https://bitbucket.org/synthetic/", "bitbucket"],
  },
  {
    args: ["-p", "compass"],
    target: ["staging", "synthetic.atlassian.net", "compass"],
  },
  {
    args: ["--upgrade"],
    target: ["staging", "synthetic.atlassian.net", "jira"],
    forwarded: ["--upgrade"],
  },
  {
    args: [
      "-uall",
      "--license=active",
      "--license-modes",
      "user-access",
      "--users-with-access",
      "one",
      "two",
      "--non-interactive",
    ],
    target: ["staging", "synthetic.atlassian.net", "jira"],
    forwarded: [
      "-uall",
      "--license=active",
      "--license-modes",
      "user-access",
      "--users-with-access",
      "one",
      "two",
      "--non-interactive",
    ],
  },
])(
  "configured installation supports verified target and policy forms %j",
  async ({ args, target, forwarded = [] }) => {
    const result = await install({ args });
    expect(result.exitCode).toBe(0);
    expect(
      result.interactions
        .filter(({ tool }) => tool === "forge")
        .map(({ args }) => args),
    ).toEqual([
      [
        "install",
        "--environment",
        target[0],
        "--site",
        target[1],
        "--product",
        target[2],
        ...forwarded,
      ],
    ]);
  },
);

test.each([2, 23, 127, 255])(
  "configured installation preserves Forge status %i",
  async (exitCode) => {
    const result = await install({ failStage: "install", exitCode });
    expect(result.exitCode).toBe(exitCode);
    expect(result.stdout).toContain("synthetic install result");
    expect(result.stderr).toContain(
      `installation failed: exit status ${exitCode}`,
    );
    expect(result.interactions.at(-1)?.args[0]).toBe("install");
  },
);

test.each([
  { failStage: "schema" },
  { failStage: "export" },
  { launchTool: "secretspec" },
  { launchTool: "forge" },
  { missingTool: "secretspec" },
  { missingTool: "forge" },
  { failStage: "install", failureMode: "signal" as const },
])(
  "configured installation fails safely without follow-up commands %j",
  async (options) => {
    const result = await install(options);
    expect(result.exitCode).toBe(1);
    expect(
      result.interactions.filter(({ tool }) => tool === "forge").length,
    ).toBe(options.failStage === "install" ? 1 : 0);
    expect(result.stderr).not.toContain("synthetic helper noise");
  },
);

test("configured installation ignores deployment-only scope checks and needs no manifest", async () => {
  const result = await install({
    manifest: null,
    spec: `${installationSpec.replace('["SHARED", "OPTIONAL"]', '["FORGE_SITE", "SHARED"]')}\n[scopes.manifest]\nsecrets = ["SHARED", "OPTIONAL"]\n`,
    values: { ...installationValues, OPTIONAL: "--local-only" },
  });
  expect(result.exitCode).toBe(0);
  expect(
    result.interactions
      .filter(({ tool }) => tool === "forge")
      .map(({ args }) => args[0]),
  ).toEqual(["install"]);
});

test.each([
  { args: ["--environment", "development"] },
  { args: ["-e", "development"] },
  { args: ["--environment=alice-dev"] },
  { args: ["-edevelopment"] },
  { args: ["-dnealice-dev", "-findex.run"] },
  { args: ["--debugFunctionHandlers", "--environment", "-edevelopment"] },
  { args: ["-f", "--help", "-edevelopment"] },
  { args: ["--debugHost", "--environment", "development"] },
  { args: ["--debugStartingPort=--environment", "-edevelopment"] },
  { args: ["-u", "--help", "-edevelopment"] },
  { args: ["-dnu", "--environment", "-edevelopment"] },
  {
    args: ["--url", "--environment", "--local-port", "--help", "-edevelopment"],
  },
  { args: ["-edevelopment", "--", "--help", "-eproduction"] },
])(
  "configured tunnel preserves verified argument grammar %j",
  async ({ args }) => {
    const result = await deploy({ command: "tunnel", args });
    expect(result.exitCode).toBe(0);
    expect(
      result.interactions.filter(({ tool }) => tool === "forge"),
    ).toHaveLength(1);
    expect(
      result.interactions.at(-1)?.args.filter((arg) => arg === "tunnel"),
    ).toHaveLength(1);
    if (args.some((arg) => arg === "--"))
      expect(result.interactions.at(-1)?.args.slice(-3)).toEqual([
        "--",
        "--help",
        "-eproduction",
      ]);
  },
);

test.each([
  { args: ["--environment"] },
  { args: ["-e"] },
  { args: ["--environment="] },
  { args: ["-e=development"] },
  { args: ["-e", ""] },
  { args: ["-e", "--verbose"] },
  { args: ["-e", "staging"] },
  { args: ["--environment=production"] },
  { args: ["--environment", sharedValue] },
  { args: ["-edevelopment", "--environment", "development"] },
  { args: ["-dnealice-dev", "-edevelopment"] },
])(
  "configured tunnel rejects invalid or duplicate targets %j before tools",
  async ({ args }) => {
    const result = await deploy({ command: "tunnel", args });
    expect(result.exitCode).toBe(1);
    expect(result.interactions).toEqual([]);
    expect(result.stderr).toContain("tunnel option validation");
  },
);

test.each(["production", "", "bad.target"])(
  "configured tunnel rejects unsupported configured target %j",
  async (target) => {
    const result = await deploy({
      command: "tunnel",
      values: { ...deploymentValues, FORGE_ENV: target },
    });
    expect(result.exitCode).toBe(1);
    expect(result.interactions.filter(({ tool }) => tool === "forge")).toEqual(
      [],
    );
    expect(result.stderr).toContain("tunnel target validation");
  },
);

test.each(["", "--option-like", "0", "false"])(
  "configured tunnel preserves destination-supported runtime string %j",
  async (value) => {
    const result = await deploy({
      command: "tunnel",
      args: ["-edevelopment"],
      values: { ...deploymentValues, OPTIONAL: value },
    });
    expect(result.exitCode).toBe(0);
    expect(result.interactions.at(-1)?.runtime).toEqual({
      SHARED: sharedValue,
      OPTIONAL: value,
    });
  },
);

test.each([
  deploymentSpec.split("[scopes.runtime]")[0] ?? "",
  `${deploymentSpec.replace('["SHARED", "OPTIONAL"]', '["OTHER"]')}\n[profiles.other]\nOTHER = { description = "Other profile" }\n`,
])(
  "configured tunnel without effective runtime members creates no injection or synchronization",
  async (spec) => {
    const result = await deploy({
      command: "tunnel",
      args: ["-edevelopment"],
      spec,
      manifest: null,
      env: { FORGE_USER_VAR_UNDECLARED: "stale" },
    });
    expect(result.exitCode).toBe(0);
    expect(result.interactions.map(({ args }) => args[0])).toEqual([
      "schema",
      "export",
      "tunnel",
    ]);
    expect(result.interactions.at(-1)?.runtime).toEqual({});
  },
);

test("configured tunnel checks manifest declarations before starting and reuses shared local/runtime values", async () => {
  const spec = `${deploymentSpec}\n[scopes.manifest]\nsecrets = ["SHARED", "OPTIONAL"]\n`;
  const mismatch = await deploy({
    command: "tunnel",
    args: ["-edevelopment"],
    spec,
    manifest: "environment:\n  variables: [SHARED]\n",
  });
  expect(mismatch.exitCode).toBe(1);
  expect(mismatch.interactions.filter(({ tool }) => tool === "forge")).toEqual(
    [],
  );
  expect(mismatch.stderr).toContain("manifest declaration for OPTIONAL");
  const match = await deploy({
    command: "tunnel",
    args: ["-edevelopment"],
    spec,
    manifest:
      "environment:\n  variables:\n    - SHARED\n    - key: OPTIONAL\n      default: fallback\n",
  });
  expect(match.exitCode).toBe(0);
  expect(match.interactions.at(-1)?.runtime).toEqual({ SHARED: sharedValue });
  expect(match.interactions.at(-1)?.values["SHARED"]).toBe(sharedValue);
});

test.each(["SHARED", "LOCAL_ONLY", "FORGE_ENV"])(
  "configured tunnel requires whole-profile %s despite target override",
  async (missing) => {
    const values: Record<string, string> = { ...deploymentValues };
    delete values[missing];
    const result = await deploy({
      command: "tunnel",
      args: ["-edevelopment"],
      values,
      env: { SECRETSPEC_SCOPE: "runtime" },
    });
    expect(result.exitCode).toBe(1);
    expect(result.interactions.filter(({ tool }) => tool === "forge")).toEqual(
      [],
    );
    expect(result.stderr).toContain("resolved value validation");
  },
);

test.each([2, 23, 127, 255])(
  "configured tunnel preserves numeric status %i without follow-up",
  async (exitCode) => {
    const result = await deploy({
      command: "tunnel",
      args: ["-edevelopment"],
      failStage: "tunnel",
      exitCode,
    });
    expect(result.exitCode).toBe(exitCode);
    expect(result.stderr).toContain(`tunnel failed: exit status ${exitCode}`);
    expect(result.stdout).toContain("synthetic tunnel result");
    expect(result.interactions.map(({ args }) => args[0])).toEqual([
      "schema",
      "export",
      "tunnel",
    ]);
  },
);

test.each([
  { failStage: "schema" },
  { failStage: "export" },
  { missingTool: "forge" },
  { missingTool: "secretspec" },
  { launchTool: "forge" },
  { launchTool: "secretspec" },
  { failStage: "tunnel", failureMode: "signal" as const },
])(
  "configured tunnel fails safely with private helper output %j",
  async (options) => {
    const result = await deploy({
      ...options,
      command: "tunnel",
      args: ["-edevelopment"],
    });
    expect(result.exitCode).toBe(1);
    expect(
      result.interactions
        .filter(({ tool }) => tool === "forge")
        .map(({ args }) => args[0]),
    ).toEqual(options.failStage === "tunnel" ? ["tunnel"] : []);
    expect(result.stderr).not.toContain("synthetic helper noise");
    expect(result.stderr).not.toContain(
      "Remote variables may already have changed",
    );
  },
);

test.skipIf(process.platform === "win32").each([
  { blockStage: "schema", signal: "SIGINT", ignoreSignal: false },
  { blockStage: "export", signal: "SIGTERM", ignoreSignal: true },
  { blockStage: "tunnel", signal: "SIGINT", ignoreSignal: false },
  { blockStage: "tunnel", signal: "SIGINT", ignoreSignal: true },
  { blockStage: "tunnel", signal: "SIGTERM", ignoreSignal: true },
] as const)(
  "configured tunnel interruption $signal at $blockStage cleans descendants (ignores: $ignoreSignal)",
  async ({ blockStage, signal, ignoreSignal }) => {
    const result = await deploy({
      command: "tunnel",
      args: ["-edevelopment"],
      blockStage,
      ignoreSignal,
      spawnDescendant: true,
      onSpawn: async (child, project) => {
        await waitUntil(
          () =>
            existsSync(join(project, "ready")) &&
            existsSync(join(project, "descendant-ready")),
          "tunnel group readiness",
        );
        const pid = Number(await Bun.file(join(project, "ready")).text());
        const descendant = Number(
          await Bun.file(join(project, "descendant-ready")).text(),
        );
        child.kill(signal);
        await waitUntil(
          () => child.exitCode !== null,
          "interrupted tunnel wrapper exit",
        );
        await waitUntil(
          () => !processRunning(pid) && !processRunning(descendant),
          "tunnel group cleanup",
        );
        expect(await Bun.file(join(project, "received-signal")).text()).toBe(
          signal,
        );
      },
    });
    expect(result.exitCode).toBe(signal === "SIGINT" ? 130 : 143);
    expect(result.stderr).toContain(`interrupted by ${signal}`);
    expect(result.interactions.at(-1)?.args[0]).toBe(blockStage);
  },
  12_000,
);

const realSecretSpec = Bun.which("secretspec");

test.skipIf(!realSecretSpec).each([
  {
    name: "canonical",
    declarations:
      'FORGE_ENVIRONMENT = { description = "Target", default = "development" }',
    args: [],
    pass: true,
    target: "development",
  },
  {
    name: "legacy named development",
    declarations:
      'FORGE_ENV = { description = "Target", default = "alice-dev" }',
    args: [],
    pass: true,
    target: "alice-dev",
  },
  {
    name: "matching aliases",
    declarations:
      'FORGE_ENVIRONMENT = { description = "Target", default = "development" }\nFORGE_ENV = { description = "Legacy", default = "development" }',
    args: [],
    pass: true,
    target: "development",
  },
  {
    name: "explicit override",
    declarations:
      'FORGE_ENVIRONMENT = { description = "Target", default = "staging" }',
    args: ["--environment=alice-dev"],
    pass: true,
    target: "alice-dev",
  },
  {
    name: "optional fallback",
    declarations:
      'FORGE_ENVIRONMENT = { description = "Target", required = false }',
    args: [],
    pass: true,
    target: "development",
  },
  {
    name: "unsupported staging",
    declarations:
      'FORGE_ENVIRONMENT = { description = "Target", default = "staging" }',
    args: [],
    pass: false,
    target: "unused",
  },
  {
    name: "conflict despite override",
    declarations:
      'FORGE_ENVIRONMENT = { description = "Target", default = "staging" }\nFORGE_ENV = { description = "Legacy", default = "production" }',
    args: ["-edevelopment"],
    pass: false,
    target: "unused",
  },
  {
    name: "required despite override",
    declarations:
      'FORGE_ENVIRONMENT = { description = "Target", required = true }',
    args: ["-edevelopment"],
    pass: false,
    target: "unused",
  },
])(
  "native configured tunnel controls-only profile: $name",
  async ({ declarations, args, pass, target }) => {
    const result = await deploy({
      command: "tunnel",
      args,
      realSecretSpec: realSecretSpec ?? "",
      spec: `[project]\nname = "synthetic-tunnel-controls"\nrevision = "1.0"\n[profiles.default]\n${declarations}\nFORGE_SITE = { description = "Site", default = "synthetic.atlassian.net" }\nFORGE_PRODUCT = { description = "Product", default = "jira" }\n`,
      schema: {
        properties: {
          FORGE_ENVIRONMENT: {},
          FORGE_ENV: {},
          FORGE_SITE: {},
          FORGE_PRODUCT: {},
        },
      },
      manifest: null,
      dotenv: "",
      env: {
        SECRETSPEC_PROVIDER: "dotenv:values.env",
        FORGE_ENVIRONMENT: "stale",
        FORGE_USER_VAR_UNDECLARED: "stale",
      },
    });
    expect(result.exitCode).toBe(pass ? 0 : 1);
    const forge = result.interactions.filter(({ tool }) => tool === "forge");
    expect(forge.map(({ args }) => args)).toEqual(
      pass ? [["tunnel", "--environment", target]] : [],
    );
    if (pass) expect(forge[0]?.runtime).toEqual({});
  },
);

test.skipIf(!realSecretSpec)(
  "native configured tunnel shares one inherited profile resolution with local manifest and runtime destinations",
  async () => {
    const spec = `${canonicalSpec.replace("[scopes.runtime]", '[profiles.localdev]\nFORGE_ENVIRONMENT = { description = "Target", default = "development" }\nLOCAL_ONLY = { description = "Local override", default = "synthetic-local-dev" }\n\n[scopes.runtime]')}\n[scopes.manifest]\nsecrets = ["SHARED"]\n`;
    const result = await deploy({
      command: "tunnel",
      realSecretSpec: realSecretSpec ?? "",
      spec,
      files: { "selected.toml": spec },
      schema: canonicalSchema,
      manifest: "environment:\n  variables: [SHARED]\n",
      dotenv: "SHARED=synthetic-native-shared\nOPTIONAL=\n",
      env: {
        SECRETSPEC_FILE: "selected.toml",
        SECRETSPEC_PROFILE: "localdev",
        SECRETSPEC_PROVIDER: "dotenv:values.env",
        SECRETSPEC_SCOPE: "manifest",
        FORGE_USER_VAR_OPTIONAL: "stale",
        FORGE_USER_VAR_LOCAL_ONLY: "unauthorized",
      },
    });
    expect(result.exitCode).toBe(0);
    const forge = result.interactions.filter(({ tool }) => tool === "forge");
    expect(forge).toEqual([
      {
        tool: "forge",
        args: ["tunnel", "--environment", "development"],
        values: {
          FORGE_ENVIRONMENT: "development",
          SHARED: "synthetic-native-shared",
          LOCAL_ONLY: "synthetic-local-dev",
          OPTIONAL: "",
        },
        runtime: { SHARED: "synthetic-native-shared", OPTIONAL: "" },
      },
    ]);
    const native = result.interactions.filter(
      ({ tool }) => tool === "secretspec",
    );
    expect(native.map(({ args }) => args[0])).toEqual(["schema", "export"]);
    for (const { args } of native)
      expect(args.slice(1, 5)).toEqual([
        "--file",
        join(result.project, "selected.toml"),
        "--profile",
        "localdev",
      ]);
  },
);

test.skipIf(!realSecretSpec).each(["SHARED", "LOCAL_ONLY"])(
  "native configured tunnel blocks missing whole-profile %s despite explicit target",
  async (missing) => {
    const result = await deploy({
      command: "tunnel",
      args: ["-edevelopment"],
      realSecretSpec: realSecretSpec ?? "",
      spec: canonicalSpec,
      schema: canonicalSchema,
      dotenv:
        missing === "SHARED"
          ? "LOCAL_ONLY=synthetic-local\n"
          : "SHARED=synthetic-shared\n",
      env: {
        SECRETSPEC_PROVIDER: "dotenv:values.env",
        SECRETSPEC_SCOPE: "runtime",
      },
    });
    expect(result.exitCode).toBe(1);
    expect(result.interactions.filter(({ tool }) => tool === "forge")).toEqual(
      [],
    );
  },
);

test.skipIf(!realSecretSpec)(
  "native configured tunnel omits absent optional runtime values and stale injection",
  async () => {
    const result = await deploy({
      command: "tunnel",
      args: ["-edevelopment"],
      realSecretSpec: realSecretSpec ?? "",
      spec: canonicalSpec,
      schema: canonicalSchema,
      dotenv:
        "SHARED=synthetic-native-shared\nLOCAL_ONLY=synthetic-native-local\n",
      env: {
        SECRETSPEC_PROVIDER: "dotenv:values.env",
        OPTIONAL: "stale",
        FORGE_USER_VAR_OPTIONAL: "stale",
      },
    });
    expect(result.exitCode).toBe(0);
    expect(result.interactions.at(-1)?.values).toEqual({
      FORGE_ENVIRONMENT: "staging",
      SHARED: "synthetic-native-shared",
      LOCAL_ONLY: "synthetic-native-local",
    });
    expect(result.interactions.at(-1)?.runtime).toEqual({
      SHARED: "synthetic-native-shared",
    });
  },
);

test.skipIf(!realSecretSpec).each(
  [
    {
      name: "canonical",
      declarations: 'FORGE_ENVIRONMENT = { default = "staging" }',
      target: "staging",
      args: [],
      pass: true,
    },
    {
      name: "legacy",
      declarations: 'FORGE_ENV = { default = "staging" }',
      target: "staging",
      args: [],
      pass: true,
    },
    {
      name: "matching aliases",
      declarations:
        'FORGE_ENVIRONMENT = { default = "staging" }\nFORGE_ENV = { default = "staging" }',
      target: "staging",
      args: [],
      pass: true,
    },
    {
      name: "explicit override",
      declarations: 'FORGE_ENVIRONMENT = { default = "staging" }',
      target: "production",
      args: ["-eproduction"],
      pass: true,
    },
    {
      name: "absent optional environment",
      declarations: "FORGE_ENVIRONMENT = { required = false }",
      target: "development",
      args: [],
      pass: true,
    },
    {
      name: "conflicting aliases despite override",
      declarations:
        'FORGE_ENVIRONMENT = { default = "staging" }\nFORGE_ENV = { default = "production" }',
      target: "unused",
      args: ["-edevelopment"],
      pass: false,
    },
    {
      name: "required environment despite override",
      declarations: "FORGE_ENVIRONMENT = { required = true }",
      target: "unused",
      args: ["-edevelopment"],
      pass: false,
    },
  ].flatMap((scenario) =>
    (["install", "uninstall"] as const).map((command) => ({
      ...scenario,
      command,
    })),
  ),
)(
  "native configured $command controls-only profile: $name",
  async ({ command, declarations, target, args, pass }) => {
    const result = await install({
      command,
      realSecretSpec: realSecretSpec ?? "",
      spec: `[project]\nname = "synthetic-install"\nrevision = "1.0"\n[profiles.default]\n${declarations.replaceAll(" = {", ' = { description = "Synthetic control",')}\nFORGE_SITE = { description = "Installation site", default = "synthetic.atlassian.net" }\nFORGE_PRODUCT = { description = "Installation product", default = "jira" }\n`,
      schema: {
        properties: {
          FORGE_ENVIRONMENT: {},
          FORGE_ENV: {},
          FORGE_SITE: {},
          FORGE_PRODUCT: {},
        },
      },
      env: {
        SECRETSPEC_PROVIDER: "dotenv:values.env",
        SECRETSPEC_PROFILE: "default",
        FORGE_ENVIRONMENT: "stale",
      },
      dotenv: "",
      args,
      manifest: null,
    });
    expect(result.exitCode).toBe(pass ? 0 : 1);
    expect(
      result.interactions
        .filter(({ tool }) => tool === "forge")
        .map(({ args }) => args),
    ).toEqual(
      pass
        ? [
            [
              command,
              "--environment",
              target,
              "--site",
              "synthetic.atlassian.net",
              "--product",
              "jira",
            ],
          ]
        : [],
    );
    if (pass)
      expect(
        result.interactions
          .filter(({ tool }) => tool === "secretspec")
          .map(({ args }) => args[0]),
      ).toEqual(["schema", "export"]);
  },
);

test.skipIf(!realSecretSpec).each(
  ["FORGE_SITE", "FORGE_PRODUCT", "SHARED", "LOCAL_ONLY"].flatMap((missing) =>
    (["install", "uninstall"] as const).map((command) => ({
      command,
      missing,
    })),
  ),
)(
  "native configured $command still requires $missing despite overrides",
  async ({ command, missing }) => {
    const spec = installationSpec
      .replace('default = "synthetic.atlassian.net"', "required = true")
      .replace('default = "jira"', "required = true");
    const values = {
      FORGE_SITE: "synthetic.atlassian.net",
      FORGE_PRODUCT: "jira",
      SHARED: "synthetic-native-shared",
      LOCAL_ONLY: "synthetic-native-local",
    };
    const result = await install({
      command,
      realSecretSpec: realSecretSpec ?? "",
      spec,
      env: {
        SECRETSPEC_PROVIDER: "dotenv:values.env",
        SECRETSPEC_SCOPE: "runtime",
      },
      dotenv: Object.entries(values)
        .filter(([name]) => name !== missing)
        .map(([name, value]) => `${name}=${value}\n`)
        .join(""),
      args: ["-sother.atlassian.net", "-pconfluence", "-eproduction"],
    });
    expect(result.exitCode).toBe(1);
    expect(result.interactions.filter(({ tool }) => tool === "forge")).toEqual(
      [],
    );
    expect(result.stderr).toContain("SecretSpec resolution");
  },
);

test.skipIf(!realSecretSpec).each(["SHARED", "LOCAL_ONLY"])(
  "native configured lint blocks missing whole-profile requirement %s",
  async (missing) => {
    const result = await deploy({
      command: "lint",
      realSecretSpec: realSecretSpec ?? "",
      spec: `${deploymentSpec}\n[scopes.manifest]\nsecrets = ["LOCAL_ONLY"]\n`,
      env: {
        SECRETSPEC_PROVIDER: "dotenv:values.env",
        SECRETSPEC_SCOPE: "manifest",
      },
      dotenv:
        missing === "SHARED"
          ? "LOCAL_ONLY=synthetic-native-local\n"
          : "SHARED=synthetic-native-shared\n",
    });
    expect(result.exitCode).toBe(1);
    expect(result.interactions.filter(({ tool }) => tool === "forge")).toEqual(
      [],
    );
    expect(result.stderr).toContain("SecretSpec resolution");
    expect(result.stderr).not.toContain("synthetic-native");
  },
);

test.skipIf(!realSecretSpec)(
  "native configured lint delivers a selected inherited profile, shared manifest value, and cleared optionals once",
  async () => {
    const spec = `${canonicalSpec.replace("[scopes.runtime]", '[profiles.release]\nLOCAL_ONLY = { description = "Local override", default = "synthetic-release" }\n\n[scopes.runtime]')}\n[scopes.manifest]\nsecrets = ["SHARED"]\n`;
    const result = await deploy({
      command: "lint",
      realSecretSpec: realSecretSpec ?? "",
      spec,
      files: { "selected.toml": spec },
      manifest: "environment:\n  variables: [SHARED]\n",
      schema: canonicalSchema,
      env: {
        SECRETSPEC_FILE: "selected.toml",
        SECRETSPEC_PROFILE: "release",
        SECRETSPEC_PROVIDER: "dotenv:values.env",
        SECRETSPEC_SCOPE: "runtime",
        OPTIONAL: "stale",
      },
      dotenv: "SHARED=synthetic-native-shared\n",
    });
    expect(result.exitCode).toBe(0);
    expect(result.interactions.filter(({ tool }) => tool === "forge")).toEqual([
      {
        tool: "forge",
        args: ["lint"],
        values: {
          FORGE_ENVIRONMENT: "staging",
          SHARED: "synthetic-native-shared",
          LOCAL_ONLY: "synthetic-release",
        },
      },
    ]);
    const native = result.interactions.filter(
      ({ tool }) => tool === "secretspec",
    );
    expect(native.map(({ args }) => args[0])).toEqual(["schema", "export"]);
    for (const { args } of native) {
      expect(args.slice(1, 5)).toEqual([
        "--file",
        join(result.project, "selected.toml"),
        "--profile",
        "release",
      ]);
    }
  },
);

test.skipIf(!realSecretSpec)(
  "native configured lint supports controls-only profiles without target injection or manifest file",
  async () => {
    const result = await deploy({
      command: "lint",
      realSecretSpec: realSecretSpec ?? "",
      spec: '[project]\nname = "synthetic-lint-controls"\nrevision = "1.0"\n[profiles.default]\nFORGE_ENVIRONMENT = { description = "Target", default = "staging" }\nFORGE_SITE = { description = "Site", default = "synthetic.atlassian.net" }\nFORGE_PRODUCT = { description = "Product", default = "jira" }\n',
      manifest: null,
      schema: {
        properties: {
          FORGE_ENVIRONMENT: {},
          FORGE_SITE: {},
          FORGE_PRODUCT: {},
        },
      },
      env: { SECRETSPEC_PROVIDER: "dotenv:values.env" },
      dotenv: "",
    });
    expect(result.exitCode).toBe(0);
    expect(result.interactions.filter(({ tool }) => tool === "forge")).toEqual([
      {
        tool: "forge",
        args: ["lint"],
        values: {
          FORGE_ENVIRONMENT: "staging",
          FORGE_SITE: "synthetic.atlassian.net",
          FORGE_PRODUCT: "jira",
        },
      },
    ]);
  },
);

test.skipIf(!realSecretSpec).each([
  {
    name: "canonical",
    declarations:
      'FORGE_ENVIRONMENT = { description = "Canonical target", default = "staging" }',
    env: {},
    target: "staging",
    args: [],
  },
  {
    name: "legacy",
    declarations:
      'FORGE_ENV = { description = "Legacy target", default = "staging" }',
    env: {},
    target: "staging",
    args: [],
  },
  {
    name: "matching dual",
    declarations:
      'FORGE_ENVIRONMENT = { description = "Canonical target", default = "staging" }\nFORGE_ENV = { description = "Legacy target", default = "staging" }',
    env: {},
    target: "staging",
    args: [],
  },
  {
    name: "canonical override",
    declarations:
      'FORGE_ENVIRONMENT = { description = "Canonical target", default = "staging" }',
    env: {},
    target: "production",
    args: ["--environment", "production"],
  },
  {
    name: "absent canonical clears stale ambient target",
    declarations:
      'FORGE_ENVIRONMENT = { description = "Optional target", required = false }',
    env: { FORGE_ENVIRONMENT: "stale-production" },
    target: "development",
    args: [],
  },
])(
  "native controls-only profile: $name deploys without writes",
  async ({ declarations, env, target, args }) => {
    const result = await deploy({
      realSecretSpec: realSecretSpec ?? "",
      spec: `[project]\nname = "synthetic-controls"\nrevision = "1.0"\n[profiles.default]\n${declarations}\n`,
      schema: { properties: { FORGE_ENVIRONMENT: {}, FORGE_ENV: {} } },
      env: { SECRETSPEC_PROVIDER: "dotenv:values.env", ...env },
      dotenv: "",
      args,
    });
    expect({ exitCode: result.exitCode, stderr: result.stderr }).toEqual({
      exitCode: 0,
      stderr: "",
    });
    const forge = result.interactions.filter(({ tool }) => tool === "forge");
    expect(forge.map(({ args }) => args)).toEqual([
      ["deploy", "--environment", target],
    ]);
    expect(forge[0]?.values).not.toHaveProperty(
      "FORGE_ENVIRONMENT",
      "stale-production",
    );
    expect(
      result.interactions
        .filter(({ tool }) => tool === "secretspec")
        .map(({ args }) => args[0]),
    ).toEqual(["schema", "export"]);
  },
);

test.skipIf(!realSecretSpec)(
  "native canonical required control still blocks an explicit target override",
  async () => {
    const result = await deploy({
      realSecretSpec: realSecretSpec ?? "",
      spec: canonicalSpec.replace('default = "staging"', "required = true"),
      args: ["-e", "production"],
      env: {
        SECRETSPEC_PROVIDER: "dotenv:values.env",
        SECRETSPEC_SCOPE: "runtime",
      },
      dotenv:
        "SHARED=synthetic-native-shared\nLOCAL_ONLY=synthetic-native-local\n",
    });
    expect(result.exitCode).not.toBe(0);
    expect(result.interactions.filter(({ tool }) => tool === "forge")).toEqual(
      [],
    );
    expect(result.stderr).toContain("SecretSpec resolution");
    expect(result.stderr).not.toContain("synthetic-native");
  },
);

test
  .skipIf(!realSecretSpec)
  .each([{ args: [] }, { args: ["-e", "production"] }])(
  "native conflicting environment defaults fail before Forge with %j",
  async ({ args }) => {
    const result = await deploy({
      realSecretSpec: realSecretSpec ?? "",
      spec: canonicalSpec.replace(
        "[profiles.default]",
        '[profiles.default]\nFORGE_ENV = { description = "Legacy target", default = "synthetic-conflict" }',
      ),
      args,
      env: { SECRETSPEC_PROVIDER: "dotenv:values.env" },
      dotenv:
        "SHARED=synthetic-native-shared\nLOCAL_ONLY=synthetic-native-local\n",
    });
    expect(result.exitCode).not.toBe(0);
    expect(result.interactions.filter(({ tool }) => tool === "forge")).toEqual(
      [],
    );
    expect(result.stderr).toContain("FORGE_ENVIRONMENT and FORGE_ENV conflict");
    expect(result.stdout).toBe("");
    expect(result.stderr).not.toContain("synthetic-conflict");
    expect(result.stderr).not.toContain("synthetic-native");
  },
);

test.skipIf(!realSecretSpec).each(["FORGE_ENV", "FORGE_ENVIRONMENT"])(
  "native SecretSpec schema and full dotenv export share %s values and omit absent optionals",
  async (control) => {
    const result = await deploy({
      realSecretSpec: realSecretSpec ?? "",
      spec: `${deploymentSpec.replaceAll("FORGE_ENV", control)}\n[scopes.manifest]\nsecrets = ["SHARED"]\n`,
      manifest: "environment:\n  variables: [SHARED]\n",
      schema:
        control === "FORGE_ENVIRONMENT" ? canonicalSchema : deploymentSchema,
      env: { SECRETSPEC_PROVIDER: "dotenv:values.env" },
      dotenv:
        "SHARED=synthetic-native-shared\nLOCAL_ONLY=synthetic-native-local\n",
    });
    expect(result.exitCode).toBe(0);
    expect(
      result.interactions
        .filter(({ tool }) => tool === "secretspec")
        .map(({ args }) => args[0]),
    ).toEqual(["schema", "export"]);
    const forge = result.interactions.filter(({ tool }) => tool === "forge");
    expect(forge.map(({ args }) => args)).toEqual([
      [
        "variables",
        "set",
        "--encrypt",
        "--environment",
        "staging",
        "SHARED",
        "synthetic-native-shared",
      ],
      ["deploy", "--environment", "staging"],
    ]);
    for (const call of forge) {
      expect(call.values).toEqual({
        [control]: "staging",
        SHARED: "synthetic-native-shared",
        LOCAL_ONLY: "synthetic-native-local",
      });
    }
    expect(result.stdout + result.stderr).not.toContain("synthetic-native");
  },
);

test.skipIf(!realSecretSpec)(
  "native full-profile validation blocks uploads when an unscoped requirement is missing",
  async () => {
    const result = await deploy({
      realSecretSpec: realSecretSpec ?? "",
      env: {
        SECRETSPEC_PROVIDER: "dotenv:values.env",
        SECRETSPEC_SCOPE: "runtime",
      },
      dotenv: "SHARED=synthetic-native-shared\n",
    });
    expect(result.exitCode).not.toBe(0);
    expect(result.interactions.filter(({ tool }) => tool === "forge")).toEqual(
      [],
    );
    expect(
      result.interactions
        .filter(({ tool }) => tool === "secretspec")
        .map(({ args }) => args[0]),
    ).toEqual(["schema", "export"]);
    expect(result.stderr).toContain("SecretSpec resolution");
    expect(result.stdout + result.stderr).not.toContain("synthetic-native");
  },
);

test.skipIf(!realSecretSpec)(
  "native profile inheritance uses the same explicit profile for schema and export",
  async () => {
    const result = await deploy({
      realSecretSpec: realSecretSpec ?? "",
      spec: `${deploymentSpec}\n[profiles.release]\nFORGE_ENV = { description = "Release target", default = "production" }\n`,
      env: {
        SECRETSPEC_PROVIDER: "dotenv:values.env",
        SECRETSPEC_PROFILE: "release",
      },
      dotenv: "SHARED=synthetic-release\nLOCAL_ONLY=synthetic-local\n",
    });
    expect(result.exitCode).toBe(0);
    const native = result.interactions.filter(
      ({ tool }) => tool === "secretspec",
    );
    expect(
      native.map(({ args }) => args[args.indexOf("--profile") + 1]),
    ).toEqual(["release", "release"]);
    expect(result.interactions.at(-1)?.values).toEqual({
      FORGE_ENV: "production",
      SHARED: "synthetic-release",
      LOCAL_ONLY: "synthetic-local",
    });
  },
);

test.skipIf(!realSecretSpec)(
  "native standalone profile omits inherited requirements and permits empty runtime intersection",
  async () => {
    const result = await deploy({
      realSecretSpec: realSecretSpec ?? "",
      spec: `${deploymentSpec}\n[profiles.release.defaults]\ninherit = false\n[profiles.release]\nFORGE_ENV = { description = "Standalone target", default = "production" }\nLOCAL_ONLY = { description = "Standalone value", required = true }\n`,
      env: {
        SECRETSPEC_PROVIDER: "dotenv:values.env",
        SECRETSPEC_PROFILE: "release",
      },
      dotenv: "LOCAL_ONLY=synthetic-standalone\n",
    });
    expect({ exitCode: result.exitCode, stderr: result.stderr }).toEqual({
      exitCode: 0,
      stderr: "",
    });
    const forge = result.interactions.filter(({ tool }) => tool === "forge");
    expect(forge.map(({ args }) => args)).toEqual([
      ["deploy", "--environment", "production"],
    ]);
    expect(forge[0]?.values).toEqual({
      FORGE_ENV: "production",
      LOCAL_ONLY: "synthetic-standalone",
    });
  },
);

test.skipIf(!realSecretSpec)(
  "native absent optional overrides stale ambient values without narrowing the full profile",
  async () => {
    const result = await deploy({
      realSecretSpec: realSecretSpec ?? "",
      env: {
        SECRETSPEC_PROVIDER: "dotenv:values.env",
        SECRETSPEC_SCOPE: "unknown-ambient-scope",
        OPTIONAL: "synthetic-stale-optional",
      },
      dotenv:
        "SHARED=synthetic-native-shared\nLOCAL_ONLY=synthetic-native-local\n",
    });
    expect({ exitCode: result.exitCode, stderr: result.stderr }).toEqual({
      exitCode: 0,
      stderr: "",
    });
    const forge = result.interactions.filter(({ tool }) => tool === "forge");
    expect(forge).toHaveLength(2);
    for (const call of forge) {
      expect(call.values).toEqual({
        FORGE_ENV: "staging",
        SHARED: "synthetic-native-shared",
        LOCAL_ONLY: "synthetic-native-local",
      });
      expect(call.values).not.toHaveProperty("OPTIONAL");
    }
    expect(result.stdout + result.stderr).not.toContain("synthetic-stale");
  },
);

test.skipIf(!realSecretSpec).each([
  {
    name: "local empty",
    local: "",
    runtime: "synthetic-runtime",
    succeeds: true,
  },
  { name: "string zero", local: "false", runtime: "0", succeeds: true },
  { name: "string false", local: "0", runtime: "false", succeeds: true },
  {
    name: "runtime empty",
    local: "synthetic-local",
    runtime: "",
    succeeds: false,
  },
])(
  "native dotenv values: $name preserves strings or rejects before mutation",
  async ({ local, runtime, succeeds }) => {
    const result = await deploy({
      realSecretSpec: realSecretSpec ?? "",
      env: { SECRETSPEC_PROVIDER: "dotenv:values.env" },
      dotenv: `SHARED=${runtime}\nLOCAL_ONLY=${local}\n`,
    });
    expect(result.exitCode === 0).toBe(succeeds);
    const forge = result.interactions.filter(({ tool }) => tool === "forge");
    if (succeeds) {
      expect(forge.map(({ args }) => args)).toEqual([
        [
          "variables",
          "set",
          "--encrypt",
          "--environment",
          "staging",
          "SHARED",
          runtime,
        ],
        ["deploy", "--environment", "staging"],
      ]);
      for (const call of forge)
        expect(call.values).toEqual({
          FORGE_ENV: "staging",
          SHARED: runtime,
          LOCAL_ONLY: local,
        });
    } else {
      expect(forge).toEqual([]);
      expect(result.stderr).toContain("runtime selection validation");
      expect(result.stderr).toContain("empty");
    }
  },
);

test.each([
  { name: "null", value: null },
  { name: "number zero", value: 0 },
  { name: "boolean false", value: false },
  { name: "array", value: [sharedValue] },
  { name: "object", value: { secret: sharedValue } },
  { name: "NUL", value: `before\u0000${sharedValue}` },
  { name: "empty runtime", value: "" },
  { name: "leading dash", value: "--synthetic" },
])(
  "late invalid runtime value: $name prevents the earlier valid upload",
  async ({ value }) => {
    const result = await deploy({
      values: { ...deploymentValues, OPTIONAL: value },
    });
    expect(result.exitCode).not.toBe(0);
    expect(result.interactions.filter(({ tool }) => tool === "forge")).toEqual(
      [],
    );
    expect(result.stdout).toBe("");
  },
);

test.each(["SHARED", "LOCAL_ONLY"])(
  "missing required %s blocks writes even without runtime selection",
  async (key) => {
    for (const withRuntime of [false, true]) {
      const values: Record<string, unknown> = { ...deploymentValues };
      delete values[key];
      const result = await deploy({
        spec: `${withRuntime ? deploymentSpec : deploymentSpec.split("[scopes.runtime]")[0]}\n[scopes.manifest]\nsecrets = ["LOCAL_ONLY"]\n`,
        values,
        manifest: "environment:\n  variables: [LOCAL_ONLY]\n",
      });
      expect(result.exitCode).not.toBe(0);
      expect(
        result.interactions.filter(({ tool }) => tool === "forge"),
      ).toEqual([]);
      expect(result.stderr).toContain("resolved value validation");
    }
  },
);

test("omitted manifest scope does not require a manifest file or suppress local values", async () => {
  const result = await deploy({ manifest: null });
  expect(result.exitCode).toBe(0);
  expect(result.interactions.at(-1)?.values).toEqual(deploymentValues);
});

test.skipIf(!realSecretSpec).each([
  {
    name: "empty extends",
    spec: deploymentSpec.replace(
      'revision = "1.0"',
      'revision = "1.0"\nextends = []',
    ),
    succeeds: true,
  },
  {
    name: "omitted runtime",
    spec: deploymentSpec.split("[scopes.runtime]")[0] ?? "",
    succeeds: true,
  },
  {
    name: "empty scope",
    spec: deploymentSpec.replace('["SHARED", "OPTIONAL"]', "[]"),
    succeeds: false,
  },
  {
    name: "unknown scope member",
    spec: deploymentSpec.replace('["SHARED", "OPTIONAL"]', '["UNKNOWN"]'),
    succeeds: false,
  },
  {
    name: "numeric default",
    spec: deploymentSpec.replace('default = "staging"', "default = 0"),
    succeeds: false,
  },
  {
    name: "boolean default",
    spec: deploymentSpec.replace('default = "staging"', "default = false"),
    succeeds: false,
  },
  {
    name: "invalid native type",
    spec: deploymentSpec.replace(
      "required = false",
      'required = false, type = "number"',
    ),
    succeeds: false,
  },
  {
    name: "empty profile",
    spec: '[project]\nname = "synthetic"\nrevision = "1.0"\n[profiles.default]\n',
    succeeds: false,
  },
  {
    name: "empty optional profile",
    spec: '[project]\nname = "synthetic"\nrevision = "1.0"\n[profiles.default]\nOPTIONAL = { description = "Optional", required = false }\n',
    succeeds: true,
  },
])(
  "native configuration: $name is validated without remote writes",
  async ({ name, spec, succeeds }) => {
    const result = await deploy({
      realSecretSpec: realSecretSpec ?? "",
      spec,
      env: { SECRETSPEC_PROVIDER: "dotenv:values.env" },
      dotenv:
        "SHARED=synthetic-native-shared\nLOCAL_ONLY=synthetic-native-local\n",
    });
    expect({
      exitCode: result.exitCode === 0,
      stderr: succeeds ? result.stderr : "",
    }).toEqual({ exitCode: succeeds, stderr: "" });
    const forge = result.interactions.filter(({ tool }) => tool === "forge");
    if (succeeds) {
      expect(forge.at(-1)?.args[0]).toBe("deploy");
      if (name !== "empty extends") expect(forge).toHaveLength(1);
      if (name === "empty optional profile")
        expect(forge[0]?.values).toEqual({});
    } else {
      expect(forge).toEqual([]);
    }
  },
);

test.each([
  { name: "invalid TOML", spec: `not valid TOML ${sharedValue}` },
  { name: "missing specification", env: { SECRETSPEC_FILE: "missing.toml" } },
  {
    name: "malformed scope table",
    spec: `scopes = "invalid"\n${deploymentSpec}`,
  },
])(
  "invalid configuration: $name fails with secret-safe diagnostics",
  async ({ spec, env }) => {
    const result = await deploy({
      ...(spec === undefined ? {} : { spec }),
      ...(env === undefined ? {} : { env }),
      args: ["-e", "production"],
    });
    expect(result.exitCode).not.toBe(0);
    expect(result.interactions.filter(({ tool }) => tool === "forge")).toEqual(
      [],
    );
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("target production");
  },
);

test.skipIf(!realSecretSpec).each([
  {
    name: "manifest requirement",
    spec: `${deploymentSpec}\n[scopes.manifest]\nsecrets = ["LOCAL_ONLY"]\n`,
    provider: "dotenv:values.env",
    dotenv: "SHARED=synthetic-native-shared\n",
  },
  {
    name: "missing local provider file",
    spec: deploymentSpec,
    provider: "dotenv:missing.env",
    dotenv: "",
  },
  {
    name: "unknown active profile",
    spec: deploymentSpec,
    provider: "dotenv:values.env",
    dotenv: "",
    profile: "unknown-profile",
  },
])(
  "native resolution failure: $name prevents every Forge command",
  async ({ spec, provider, dotenv, profile }) => {
    const result = await deploy({
      realSecretSpec: realSecretSpec ?? "",
      spec,
      env: {
        SECRETSPEC_PROVIDER: provider,
        SECRETSPEC_SCOPE: "runtime",
        ...(profile ? { SECRETSPEC_PROFILE: profile } : {}),
      },
      dotenv,
      manifest: "environment:\n  variables: [LOCAL_ONLY]\n",
      args: ["-e", "production"],
    });
    expect(result.exitCode).not.toBe(0);
    expect(result.interactions.filter(({ tool }) => tool === "forge")).toEqual(
      [],
    );
    expect(result.stderr).toContain("SecretSpec");
    expect(result.stderr).toContain("target production");
    expect(result.stdout + result.stderr).not.toContain("synthetic-native");
  },
);

for (const toolsAvailable of [false, true]) {
  test.each(
    [
      [],
      ["help"],
      ["--help"],
      ["-h"],
      ["deploy", "--help"],
      ["deploy", "-h"],
      ["help", "deploy"],
    ].map((args) => ({ args })),
  )(
    `help %j describes the initial workflow without configuration or tool calls (tools available: ${toolsAvailable})`,
    async ({ args }) => {
      const result = await invoke(args, toolsAvailable);
      expect(result.exitCode).toBe(0);
      expect(result.stderr).toBe("");
      expect(result.stdout).toContain("Usage: fence-rider");
      expect(result.stdout).toContain("deploy");
      expect(result.stdout).toContain("encrypted runtime variables");
      expect(result.stdout).toContain("SecretSpec CLI");
      expect(result.stdout).toContain("Forge CLI");
      expect(result.stdout).toContain("PATH");
      expect(result.stdout).toContain("install");
      expect(result.stdout).toContain("tunnel");
    },
  );
}
