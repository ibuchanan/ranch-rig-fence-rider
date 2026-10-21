import { expect, test } from "bun:test";
import { readdirSync } from "node:fs";
import { useBuiltCli } from "../../support/cli.ts";
import {
  deploymentValues,
  hostileValue,
  runWorkflow,
  sharedValue,
} from "../../support/fixtures.ts";

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

test("a value with quotes, a newline and shell syntax reaches Forge as one argument and runs nothing", async () => {
  const result = await runWorkflow({
    values: { ...deploymentValues, SHARED: hostileValue },
  });
  expect(result.exitCode).toBe(0);
  const upload = result.interactions.find(({ tool }) => tool === "forge");
  expect(upload?.args.at(-1)).toBe(hostileValue);
  expect(readdirSync(result.project)).not.toContain("injected");
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

// The supervisor's branches are tested directly in process-supervisor.test.ts; one
// case per ending shows the compiled CLI reports it safely.
test("an unlaunchable helper reports safe actionable context", async () => {
  const result = await runWorkflow({
    launchTool: "secretspec",
    args: ["-e", "production"],
  });
  expect(result.exitCode).not.toBe(0);
  expect(result.stderr).toContain("unable to launch");
  expect(result.stderr).toContain("target production");
  expect(result.stdout).not.toContain("Uploaded");
});

test("a helper killed by a signal cannot become success", async () => {
  const result = await runWorkflow({
    failStage: "variables",
    failureMode: "signal",
    args: ["-e", "production"],
  });
  expect(result.exitCode).not.toBe(0);
  expect(result.stderr).toContain("terminated by SIGTERM");
  expect(result.stderr).toContain("target production");
  expect(result.stdout).not.toContain("Uploaded");
});

test("a failed upload is reported as exit 1 without raw helper output", async () => {
  const result = await runWorkflow({ failStage: "variables", exitCode: 2 });
  expect(result.exitCode).toBe(1);
  expect(result.stderr).toContain("exit status 2");
  expect(result.stderr).toContain("Remote variables may already have changed");
  expect(result.stderr).not.toContain("synthetic helper noise");
});
