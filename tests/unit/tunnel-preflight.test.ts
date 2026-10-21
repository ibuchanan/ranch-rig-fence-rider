import { expect, test } from "bun:test";
import {
  deploymentSpec,
  sharedValue,
  type ToolCall,
} from "../support/fixtures.ts";
import { runInProcess } from "../support/fake-io.ts";

const forgeCalls = (interactions: ToolCall[]) =>
  interactions.filter(({ tool }) => tool === "forge");

test("tunnel leaves manifest declarations to doctor and never reads the manifest while generating", async () => {
  const result = await runInProcess({
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

test.each([
  { failStage: "schema", stage: "SecretSpec schema" },
  { failStage: "check", stage: "SecretSpec runtime scope membership" },
  { failStage: "schema", failureMode: "signal" as const, stage: "terminated" },
  { missingTool: "secretspec", stage: "secretspec prerequisite" },
  { launchTool: "secretspec", stage: "unable to launch" },
])(
  "tunnel generation fails safely, printing no script, for %j",
  async ({ stage, ...options }) => {
    const result = await runInProcess({
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
