import { expect, test } from "bun:test";
import { useBuiltCli } from "./support/cli.ts";
import {
  deploymentSpec,
  deploymentValues,
  runWorkflow,
  sharedValue,
} from "./support/fixtures.ts";

useBuiltCli();

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
  const result = await runWorkflow({
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

test.each(["SHARED", "LOCAL_ONLY", "FORGE_ENV"])(
  "configured lint requires the whole profile including %s",
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
    expect(result.stderr).toContain("resolved value validation");
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

test.each(["schema", "export"])(
  "configured lint keeps failing %s output private",
  async (failStage) => {
    const result = await runWorkflow({ command: "lint", failStage });
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
    const result = await runWorkflow({ command: "lint", launchTool });
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("executable");
    expect(result.interactions.some(({ tool }) => tool === launchTool)).toBe(
      false,
    );
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

test("configured lint without manifest scope needs no manifest and preserves target-like payloads", async () => {
  const args = ["--approve", "--help", "--", "-h"];
  const result = await runWorkflow({ command: "lint", manifest: null, args });
  expect(result.exitCode).toBe(0);
  expect(
    result.interactions
      .filter(({ tool }) => tool === "forge")
      .map(({ args }) => args),
  ).toEqual([["lint", ...args]]);
  expect(result.interactions.at(-1)?.values).toEqual(deploymentValues);
});
