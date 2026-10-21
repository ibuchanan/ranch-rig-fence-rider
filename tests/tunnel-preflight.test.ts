import { expect, test } from "bun:test";
import { useBuiltCli } from "./support/cli.ts";
import {
  deploymentSpec,
  deploymentValues,
  runScript,
  runWorkflow,
  sharedValue,
  type ToolCall,
} from "./support/fixtures.ts";

useBuiltCli();

const forgeCalls = (interactions: ToolCall[]) =>
  interactions.filter(({ tool }) => tool === "forge");

test.each([
  deploymentSpec.split("[scopes.runtime]")[0] ?? "",
  `${deploymentSpec.replace('["SHARED", "OPTIONAL"]', '["OTHER"]')}\n[profiles.other]\nOTHER = { description = "Other profile" }\n`,
])(
  "tunnel without effective runtime members injects nothing and strips ambient prefixed values",
  async (spec) => {
    const result = await runScript({
      command: "tunnel",
      generate: ["-edevelopment"],
      spec,
      manifest: null,
      env: { FORGE_USER_VAR_UNDECLARED: "stale" },
    });
    expect(result.exitCode).toBe(0);
    expect(result.interactions.map(({ args }) => args[0])).toEqual([
      "schema",
      "check",
      "run",
      "tunnel",
    ]);
    expect(result.interactions.at(-1)?.runtime).toEqual({});
  },
);

test("tunnel leaves manifest declarations to doctor and never reads the manifest while generating", async () => {
  const result = await runWorkflow({
    command: "tunnel",
    args: ["-edevelopment"],
    spec: `${deploymentSpec}\n[scopes.manifest]\nsecrets = ["SHARED", "OPTIONAL"]\n`,
    manifest: "environment:\n  variables: [SHARED]\n",
  });
  expect(result.exitCode).toBe(0);
  expect(result.interactions.map(({ args }) => args.slice(0, 4))).toEqual([
    ["schema"],
    ["check", "--json", "--scope", "runtime"],
  ]);
});

test.each(["SHARED", "LOCAL_ONLY", "FORGE_ENVIRONMENT"])(
  "the tunnel script requires whole-profile %s despite the target override",
  async (missing) => {
    const values: Record<string, string> = { ...deploymentValues };
    delete values[missing];
    const result = await runScript({
      command: "tunnel",
      generate: ["-edevelopment"],
      values,
    });
    expect(result.exitCode).toBe(1);
    expect(forgeCalls(result.interactions)).toEqual([]);
    expect(result.stderr).toContain(`Secret '${missing}' is required`);
  },
);

test.each([2, 23, 127, 255])(
  "the tunnel script exits with Forge's status %i",
  async (exitCode) => {
    const result = await runScript({
      command: "tunnel",
      generate: ["-edevelopment"],
      failStage: "tunnel",
      exitCode,
    });
    expect(result.exitCode).toBe(exitCode);
    expect(result.stdout).toContain("synthetic tunnel result");
    expect(forgeCalls(result.interactions)).toHaveLength(1);
  },
);

test.each([
  { failStage: "schema", stage: "SecretSpec schema" },
  { failStage: "check", stage: "SecretSpec runtime scope membership" },
  { failStage: "schema", failureMode: "signal" as const, stage: "terminated" },
  { missingTool: "secretspec", stage: "secretspec prerequisite" },
  { launchTool: "secretspec", stage: "unable to launch" },
])(
  "tunnel generation fails safely, printing no script, for %j",
  async ({ stage, ...options }) => {
    const result = await runWorkflow({
      ...options,
      command: "tunnel",
      args: ["-edevelopment"],
    });
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    expect(forgeCalls(result.interactions)).toEqual([]);
    expect(result.stderr).toContain(stage);
    expect(result.stderr).toContain("No further commands were run");
    expect(result.stderr).not.toContain("synthetic helper noise");
    expect(result.stderr).not.toContain(sharedValue);
    expect(result.stderr).not.toContain(
      "Remote variables may already have changed",
    );
  },
);
