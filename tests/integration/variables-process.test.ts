import { expect, test } from "bun:test";
import { readdirSync } from "node:fs";
import { useBuiltCli } from "../support/cli.ts";
import {
  deploymentValues,
  runWorkflow,
  sharedValue,
} from "../support/fixtures.ts";

// The command's decisions are covered in-process in tests/unit/variables*.test.ts.
// These run the compiled binary against fake tools on PATH, to check what only a
// real process shows: PATH lookup, launch errors, exit statuses and signals.
useBuiltCli();

test("variables resolves once and encrypts only runtime values through real helper processes", async () => {
  const result = await runWorkflow();
  expect(result.exitCode).toBe(0);
  expect(result.interactions.map(({ tool, args }) => [tool, ...args])).toEqual([
    ["secretspec", "schema"],
    ["secretspec", "export", "--scope", "", "--format", "json"],
    ["secretspec", "check", "--json", "--scope", "manifest"],
    ["secretspec", "check", "--json", "--scope", "runtime"],
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
  ]);
  const forgeCalls = result.interactions.filter(({ tool }) => tool === "forge");
  expect(forgeCalls.map(({ values }) => values)).toEqual(
    forgeCalls.map(() => deploymentValues),
  );
  expect(readdirSync(result.project).sort()).toEqual([
    "bin",
    "manifest.yml",
    "secretspec.toml",
    "tool-calls",
  ]);
});

test.each(["secretspec", "forge"])(
  "missing %s on PATH stops before any helper interaction",
  async (missingTool) => {
    const result = await runWorkflow({ missingTool });
    expect(result.exitCode).not.toBe(0);
    expect(result.interactions).toEqual([]);
    expect(result.stderr).toContain(missingTool);
    expect(result.stderr).toContain("PATH");
  },
);

test.each(["secretspec", "forge"])(
  "unlaunchable %s executable reports safe actionable context",
  async (launchTool) => {
    const result = await runWorkflow({
      launchTool,
      args: ["-e", "production"],
    });
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain("unable to launch");
    expect(result.stderr).toContain("target production");
    expect(result.stdout).not.toContain("Uploaded");
  },
);

test.each(["schema", "export", "variables"])(
  "child signal termination during %s cannot become success",
  async (failStage) => {
    const result = await runWorkflow({
      failStage,
      failureMode: "signal",
      args: ["-e", "production"],
    });
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain("terminated by SIGTERM");
    expect(result.stderr).toContain("target production");
    expect(result.stdout).not.toContain("Uploaded");
  },
);

test.each([2, 127, 255])(
  "a failed upload with exit status %i is reported as exit 1 without raw helper output",
  async (exitCode) => {
    const result = await runWorkflow({ failStage: "variables", exitCode });
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain(`exit status ${exitCode}`);
    expect(result.stderr).toContain(
      "Remote variables may already have changed",
    );
    expect(result.stderr).not.toContain("synthetic helper noise");
  },
);
