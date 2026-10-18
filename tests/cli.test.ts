import { afterAll, beforeAll, expect, test } from "bun:test";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
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

test.each(["install", "tunnel"])(
  "%s directs developers to Forge without tool calls",
  async (command) => {
    for (const toolsAvailable of [false, true]) {
      for (const args of [[command], [command, "--help"], ["help", command]]) {
        const result = await invoke(args, toolsAvailable);
        expect(result.exitCode).not.toBe(0);
        expect(result.stdout).toBe("");
        expect(result.stderr).toContain(`${command} is unsupported`);
        expect(result.stderr).toContain(`forge ${command}`);
      }
    }
  },
);

test("deployment rejects unsupported arguments before tool calls", async () => {
  const result = await invoke(["deploy", "--unknown-option"], true);
  expect(result.exitCode).not.toBe(0);
  expect(result.stderr).toContain("unsupported arguments");
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
  "synthetic shared \"quoted\" 'value'\n$HOME; $(touch injected); `id`";
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
};

type DeployOptions = {
  spec?: string;
  values?: Record<string, unknown>;
  schema?: unknown;
  manifest?: string;
  missingTool?: string;
  failStage?: string;
  args?: string[];
  env?: Record<string, string>;
  realSecretSpec?: string;
  dotenv?: string;
};

function writeTool(path: string, tool: string) {
  writeFileSync(
    path,
    `#!${process.execPath}
const { appendFileSync } = require("node:fs");
const args = process.argv.slice(2);
const tool = ${JSON.stringify(tool)};
const fixture = JSON.parse(process.env.FIXTURE);
const names = Object.keys(fixture.schema.properties);
appendFileSync(process.env.TOOL_CALL_LOG, JSON.stringify({
  tool, args,
  values: Object.fromEntries(names.filter(name => process.env[name] !== undefined).map(name => [name, process.env[name]]))
}) + "\\n");
if (tool === "secretspec" && process.env.REAL_SECRETSPEC) {
  const result = Bun.spawnSync([process.env.REAL_SECRETSPEC, ...args], { stdout: "pipe", stderr: "pipe" });
  process.stdout.write(result.stdout);
  process.stderr.write(result.stderr);
  process.exit(result.exitCode);
}
console.error("synthetic helper noise: " + ${JSON.stringify(sharedValue)});
if (fixture.failStage === args[0]) {
  console.log(${JSON.stringify(sharedValue)});
  process.exit(23);
}
if (tool === "secretspec") console.log(JSON.stringify(args[0] === "schema" ? fixture.schema : fixture.values));
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
      schema: options.schema ?? deploymentSchema,
      values: options.values ?? deploymentValues,
      failStage: options.failStage,
    }),
    ...(options.realSecretSpec
      ? { REAL_SECRETSPEC: options.realSecretSpec }
      : {}),
    ...options.env,
  };
}

async function deploy(options: DeployOptions = {}) {
  const project = mkdtempSync(join(workspace, "deployment-"));
  const bin = join(project, "bin");
  const calls = join(project, "tool-calls");
  mkdirSync(bin);
  for (const tool of ["secretspec", "forge"]) {
    if (options.missingTool !== tool) writeTool(join(bin, tool), tool);
  }
  writeFileSync(
    join(project, "secretspec.toml"),
    options.spec ?? deploymentSpec,
  );
  writeFileSync(join(project, "manifest.yml"), options.manifest ?? "app: {}\n");
  if (options.dotenv !== undefined)
    writeFileSync(join(project, "values.env"), options.dotenv);
  const child = Bun.spawn([executable, "deploy", ...(options.args ?? [])], {
    cwd: project,
    env: deploymentEnv(project, options),
    stdout: "pipe",
    stderr: "pipe",
  });
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  const interactions: ToolCall[] = existsSync(calls)
    ? (await Bun.file(calls).text())
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line))
    : [];
  expect(stdout + stderr).not.toContain(sharedValue);
  expect(existsSync(join(project, "injected"))).toBe(false);
  return { exitCode, stdout, stderr, interactions, project };
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
});

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
  for (const failStage of ["export", "variables", "deploy"]) {
    const result = await deploy({ failStage });
    expect(result.exitCode).not.toBe(0);
    expect(result.stdout).toBe("");
    expect(result.stderr).not.toContain("synthetic helper noise");
    if (failStage !== "deploy") {
      expect(
        result.interactions.some(
          ({ tool, args }) => tool === "forge" && args[0] === "deploy",
        ),
      ).toBe(false);
    }
    expect(result.stderr).toContain(
      failStage === "export" ? "SecretSpec resolution" : "staging",
    );
  }
});

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

const realSecretSpec = Bun.which("secretspec");
test.skipIf(!realSecretSpec)(
  "native SecretSpec schema and full dotenv export share values and omit absent optionals",
  async () => {
    const result = await deploy({
      realSecretSpec: realSecretSpec ?? "",
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
        FORGE_ENV: "staging",
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
