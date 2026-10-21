import { expect, test } from "bun:test";
import { readdirSync } from "node:fs";
import { useBuiltCli } from "./support/cli.ts";
import {
  deploymentSchema,
  deploymentSpec,
  deploymentValues,
  runScript,
  runWorkflow,
  sharedValue,
  type ToolCall,
} from "./support/fixtures.ts";

useBuiltCli();

const development = { ...deploymentValues, FORGE_ENVIRONMENT: "development" };
const forgeCalls = (interactions: ToolCall[]) =>
  interactions.filter(({ tool }) => tool === "forge");

test.each(["FORGE_ENVIRONMENT", "FORGE_SITE", "FORGE_PRODUCT"])(
  "tunnel refuses runtime selection of %s before printing anything",
  async (control) => {
    const result = await runWorkflow({
      command: "tunnel",
      spec: deploymentSpec
        .replace(
          "[profiles.default]",
          `[profiles.default]\n${control === "FORGE_ENVIRONMENT" ? "" : `${control} = { description = "Protected control" }`}`,
        )
        .replace('["SHARED", "OPTIONAL"]', `["SHARED", "${control}"]`),
      schema: {
        ...deploymentSchema,
        properties: {
          ...deploymentSchema.properties,
          [control]: { type: "string" },
        },
      },
      values: { ...development, [control]: "development" },
    });
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    expect(forgeCalls(result.interactions)).toEqual([]);
    expect(result.stderr).toContain("tunnel runtime selection validation");
  },
);

test("tunnel normalizes an explicit named development override and preserves debug payloads", async () => {
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
  const result = await runScript({
    command: "tunnel",
    generate: ["-ealice-dev", ...args],
  });
  expect(result.exitCode).toBe(0);
  expect(forgeCalls(result.interactions).map(({ args }) => args)).toEqual([
    ["tunnel", "--environment", "alice-dev", ...args],
  ]);
});

test("tunnel appends the runner's arguments after the embedded ones", async () => {
  const result = await runScript({
    command: "tunnel",
    generate: ["-edevelopment", "--verbose"],
    appended: ["-p", "9230", "a b;$(touch injected)"],
  });
  expect(result.exitCode).toBe(0);
  expect(forgeCalls(result.interactions).map(({ args }) => args)).toEqual([
    [
      "tunnel",
      "--environment",
      "development",
      "--verbose",
      "-p",
      "9230",
      "a b;$(touch injected)",
    ],
  ]);
});

test("tunnel refuses reserved prefix declarations rather than losing local values or bypassing selection", async () => {
  const result = await runWorkflow({
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
  expect(result.stdout).toBe("");
  expect(forgeCalls(result.interactions)).toEqual([]);
  expect(result.stderr).toContain("tunnel runtime selection validation");
  expect(result.stderr).not.toContain("synthetic collision");
});

test("tunnel maps only explicit runtime members, resolving values only inside secretspec run, without writes", async () => {
  const result = await runScript({
    command: "tunnel",
    values: development,
    env: {
      FORGE_USER_VAR_SHARED: "stale shared",
      FORGE_USER_VAR_OPTIONAL: "stale optional",
      FORGE_USER_VAR_LOCAL_ONLY: "unauthorized local",
      FORGE_USER_VAR_UNDECLARED: "unauthorized ambient",
    },
  });
  expect(result.exitCode).toBe(0);
  expect(forgeCalls(result.interactions)).toEqual([
    {
      tool: "forge",
      args: ["tunnel", "--environment", "development"],
      values: development,
      runtime: { SHARED: sharedValue },
    },
  ]);
  // The generator asks for names only; the values reach Forge through `run`.
  expect(result.generated.interactions.map(({ args }) => args[0])).toEqual([
    "schema",
    "check",
  ]);
  expect(result.interactions.map(({ args }) => args[0])).toEqual([
    "schema",
    "check",
    "run",
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

test("a resolved optional runtime member is mapped, even when empty", async () => {
  const result = await runScript({
    command: "tunnel",
    values: { ...development, OPTIONAL: "" },
  });
  expect(result.exitCode).toBe(0);
  expect(forgeCalls(result.interactions)[0]?.runtime).toEqual({
    SHARED: sharedValue,
    OPTIONAL: "",
  });
});

test("the generator never prints a value", async () => {
  const result = await runWorkflow({ command: "tunnel", values: development });
  expect(result.exitCode).toBe(0);
  expect(result.stdout).toStartWith("exec secretspec run --scope '' -- sh -c ");
  expect(result.stdout).toContain('export FORGE_USER_VAR_SHARED="$SHARED"');
  expect(result.stdout).not.toContain("FORGE_USER_VAR_LOCAL_ONLY");
  expect(result.stdout).toEndWith(`' sh tunnel "$@"\n`);
});

test.each([
  { args: ["-e", "--verbose"] },
  { args: ["-edevelopment", "--environment", "development"] },
])(
  "tunnel refuses invalid or duplicate targets %j before tools",
  async ({ args }) => {
    const result = await runWorkflow({ command: "tunnel", args });
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.interactions).toEqual([]);
    expect(result.stderr).toContain("tunnel option validation");
  },
);

test.each(["", "-x", "--help"])(
  "the tunnel script refuses FORGE_ENVIRONMENT=%j without calling Forge",
  async (target) => {
    const result = await runScript({
      command: "tunnel",
      values: { ...deploymentValues, FORGE_ENVIRONMENT: target },
    });
    expect(result.exitCode).toBe(1);
    expect(forgeCalls(result.interactions)).toEqual([]);
    expect(result.stderr).toContain("target is missing or invalid");
  },
);
