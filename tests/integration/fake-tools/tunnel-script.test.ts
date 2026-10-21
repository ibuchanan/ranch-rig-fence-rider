import { expect, test } from "bun:test";
import { readdirSync } from "node:fs";
import { useBuiltCli } from "../../support/cli.ts";
import {
  standardSpec,
  deploymentValues,
  runScript,
  sharedValue,
  type ToolCall,
} from "../../support/fixtures.ts";

// Generates the tunnel script with the compiled CLI, then runs it under sh
// with fake tools on PATH. What the generator decides is covered in-process
// by tests/unit/tunnel*.test.ts.
useBuiltCli();

const development = { ...deploymentValues, FORGE_ENVIRONMENT: "development" };
const forgeCalls = (interactions: ToolCall[]) =>
  interactions.filter(({ tool }) => tool === "forge");

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

// Target refusal is shared code; lint-deploy-install-scripts.test.ts runs every refused value.
test.each(["-x"])(
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

test.each([
  standardSpec.dropScope("runtime").build(),
  standardSpec
    .setMembers("runtime", ["OTHER"])
    .profile("other", { OTHER: { description: "Other profile" } })
    .build(),
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

// Missing SHARED and LOCAL_ONLY run against real SecretSpec in real-secretspec/tunnel-install-scripts.test.ts.
test.each(["FORGE_ENVIRONMENT"])(
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

// The exec that passes Forge's status through is shared; lint-deploy-install-scripts.test.ts runs four statuses.
test.each([23])(
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
