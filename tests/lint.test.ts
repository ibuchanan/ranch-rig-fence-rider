import { expect, test } from "bun:test";
import { useBuiltCli } from "./support/cli.ts";
import {
  deploymentSchema,
  deploymentSpec,
  deploymentValues,
  runWorkflow,
  sharedValue,
} from "./support/fixtures.ts";

useBuiltCli();

test("configured lint checks the manifest scope, then runs Forge under secretspec run with arguments and values preserved", async () => {
  const args = [
    "--fix",
    "--verbose",
    "--approve",
    sharedValue,
    "--",
    "--environment",
    "production",
  ];
  const result = await runWorkflow({
    command: "lint",
    args,
    env: { OPTIONAL: "stale" },
  });
  expect(result.exitCode).toBe(0);
  // secretspec run does not clear an ambient value for an unresolved optional.
  expect(result.interactions.filter(({ tool }) => tool === "forge")).toEqual([
    {
      tool: "forge",
      args: ["lint", ...args],
      values: { ...deploymentValues, OPTIONAL: "stale" },
    },
  ]);
  const native = result.interactions.filter(
    ({ tool }) => tool === "secretspec",
  );
  expect(native.map(({ args }) => args[0])).toEqual(["check", "run"]);
  expect(native[1]?.args.slice(0, 4)).toEqual(["run", "--scope", "", "--"]);
  expect(native[1]?.args.slice(5)).toEqual(["lint", ...args]);
  expect(result.stdout).toContain("synthetic lint result");
  expect(result.stderr).toBe("synthetic lint warning\n");
  expect(result.stdout + result.stderr).not.toContain("synthetic helper noise");
});

test("configured lint checks manifest declarations including absent optionals before Forge", async () => {
  const spec = `${deploymentSpec}\n[scopes.manifest]\nsecrets = ["SHARED", "OPTIONAL"]\n`;
  const mismatch = await runWorkflow({
    command: "lint",
    spec,
    manifest: "environment:\n  variables: [SHARED]\n",
  });
  expect(mismatch.exitCode).toBe(1);
  expect(mismatch.interactions.filter(({ tool }) => tool === "forge")).toEqual(
    [],
  );
  expect(mismatch.stderr).toContain("manifest declaration for OPTIONAL");
  const match = await runWorkflow({
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

test.each(["SHARED", "LOCAL_ONLY", "FORGE_ENVIRONMENT"])(
  "configured lint requires the whole profile including %s, failing inside secretspec run",
  async (missing) => {
    const values: Record<string, string> = { ...deploymentValues };
    delete values[missing];
    const result = await runWorkflow({
      command: "lint",
      values,
      env: { SECRETSPEC_SCOPE: "manifest" },
    });
    expect(result.exitCode).toBe(1);
    expect(result.interactions.filter(({ tool }) => tool === "forge")).toEqual(
      [],
    );
    expect(result.stderr).toContain(`Secret '${missing}' is required`);
    expect(result.stderr).toContain("lint failed: exit status 1");
  },
);

test.each([2, 23, 127, 255])(
  "configured lint preserves Forge status %i and useful diagnostics",
  async (exitCode) => {
    const result = await runWorkflow({
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

test.each([
  {
    failStage: "check",
    exitCode: 1,
    stage: "manifest scope membership failed",
  },
  { failStage: "run", exitCode: 23, stage: "lint failed: exit status 23" },
])(
  "configured lint keeps a failing secretspec $failStage private",
  async ({ failStage, exitCode, stage }) => {
    const result = await runWorkflow({ command: "lint", failStage });
    expect(result.exitCode).toBe(exitCode);
    expect(result.interactions.filter(({ tool }) => tool === "forge")).toEqual(
      [],
    );
    expect(result.stderr).toContain(stage);
    expect(result.stderr).not.toContain("synthetic helper noise");
  },
);

test.each([
  { launchTool: "secretspec", message: "executable" },
  { launchTool: "forge", message: "Failed to run command" },
])(
  "configured lint fails safely for unlaunchable $launchTool",
  async ({ launchTool, message }) => {
    const result = await runWorkflow({ command: "lint", launchTool });
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain(message);
    expect(result.interactions.some(({ tool }) => tool === launchTool)).toBe(
      false,
    );
  },
);

test.each(["secretspec", "forge"])(
  "configured lint stops before any tool call when %s is missing",
  async (missingTool) => {
    const result = await runWorkflow({ command: "lint", missingTool });
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain(`${missingTool} prerequisite`);
    expect(result.interactions).toEqual([]);
  },
);

test("configured lint treats child signal termination as failure", async () => {
  const result = await runWorkflow({
    command: "lint",
    failStage: "lint",
    failureMode: "signal",
  });
  expect(result.exitCode).toBe(1);
  expect(result.stderr).toContain("terminated by SIGTERM");
});

test("configured lint without manifest scope needs no manifest and forwards arguments after the terminator", async () => {
  const args = ["--verbose", "--", "--help", "-h"];
  const result = await runWorkflow({ command: "lint", manifest: null, args });
  expect(result.exitCode).toBe(0);
  expect(
    result.interactions
      .filter(({ tool }) => tool === "forge")
      .map(({ args }) => args),
  ).toEqual([["lint", ...args]]);
  expect(result.interactions.at(-1)?.values).toEqual(deploymentValues);
});

test("configured lint keeps special characters in forwarded arguments as single arguments", async () => {
  const args = ["--note", "a b; touch injected $(id) `id`", "--flag=x y"];
  const result = await runWorkflow({ command: "lint", args });
  expect(result.exitCode).toBe(0);
  expect(
    result.interactions
      .filter(({ tool }) => tool === "forge")
      .map(({ args }) => args),
  ).toEqual([["lint", ...args]]);
});

test("configured lint uses an exported variable the profile does not declare", async () => {
  const result = await runWorkflow({
    command: "lint",
    schema: {
      ...deploymentSchema,
      properties: { ...deploymentSchema.properties, EXTRA: { type: "string" } },
    },
    env: { EXTRA: "ambient-extra" },
  });
  expect(result.exitCode).toBe(0);
  expect(result.interactions.at(-1)?.values).toEqual({
    ...deploymentValues,
    EXTRA: "ambient-extra",
  });
});

test("configured lint does not read manifest.yml unless the manifest scope has members", async () => {
  const result = await runWorkflow({ command: "lint", manifest: null });
  expect(result.exitCode).toBe(0);
  const spec = `${deploymentSpec}\n[scopes.manifest]\nsecrets = ["SHARED"]\n`;
  const blocked = await runWorkflow({ command: "lint", spec, manifest: null });
  expect(blocked.exitCode).toBe(1);
  expect(blocked.interactions.filter(({ tool }) => tool === "forge")).toEqual(
    [],
  );
});
