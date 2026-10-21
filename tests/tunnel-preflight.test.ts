import { expect, test } from "bun:test";
import { useBuiltCli } from "./support/cli.ts";
import {
  deploymentSpec,
  deploymentValues,
  runWorkflow,
  sharedValue,
} from "./support/fixtures.ts";

useBuiltCli();

test.each([
  deploymentSpec.split("[scopes.runtime]")[0] ?? "",
  `${deploymentSpec.replace('["SHARED", "OPTIONAL"]', '["OTHER"]')}\n[profiles.other]\nOTHER = { description = "Other profile" }\n`,
])(
  "configured tunnel without effective runtime members creates no injection or synchronization",
  async (spec) => {
    const result = await runWorkflow({
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
      "check",
      "check",
      "tunnel",
    ]);
    expect(result.interactions.at(-1)?.runtime).toEqual({});
  },
);

test("configured tunnel checks manifest declarations before starting and reuses shared local/runtime values", async () => {
  const spec = `${deploymentSpec}\n[scopes.manifest]\nsecrets = ["SHARED", "OPTIONAL"]\n`;
  const mismatch = await runWorkflow({
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
  const match = await runWorkflow({
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

test.each(["SHARED", "LOCAL_ONLY", "FORGE_ENVIRONMENT"])(
  "configured tunnel requires whole-profile %s despite target override",
  async (missing) => {
    const values: Record<string, string> = { ...deploymentValues };
    delete values[missing];
    const result = await runWorkflow({
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
    const result = await runWorkflow({
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
      "check",
      "check",
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
    const result = await runWorkflow({
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
