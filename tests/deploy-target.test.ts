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

test("canonical environment selects the same target for encrypted uploads and one deployment", async () => {
  const result = await runWorkflow({
    spec: deploymentSpec,
    schema: deploymentSchema,
    values: deploymentValues,
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
    ["deploy", "--environment", "staging"],
  ]);
  expect(
    result.interactions
      .filter(({ tool }) => tool === "secretspec")
      .map(({ args }) => args[0]),
  ).toEqual(["schema", "export", "check", "check"]);
  for (const call of result.interactions.filter(
    ({ tool }) => tool === "forge",
  )) {
    expect(call.values).toEqual(deploymentValues);
  }
});

test.each([
  { name: "short override", args: ["-e", "production"] },
  { name: "long override", args: ["--environment=production"] },
  { name: "configured default", args: [] },
])(
  "$name environment control preserves selection and child values",
  async ({ args }) => {
    const result = await runWorkflow({
      spec: deploymentSpec,
      schema: deploymentSchema,
      values: deploymentValues,
      args,
    });
    expect(result.exitCode).toBe(0);
    const forge = result.interactions.filter(({ tool }) => tool === "forge");
    expect(
      forge.map(({ args }) => args[args.indexOf("--environment") + 1]),
    ).toEqual(
      args.length ? ["production", "production"] : ["staging", "staging"],
    );
    expect(forge.map(({ args }) => args[0])).toEqual(["variables", "deploy"]);
    expect(forge.at(-1)?.values).toEqual(deploymentValues);
  },
);

test("explicit environment overrides the configured target for every Forge command", async () => {
  const result = await runWorkflow({ args: ["--environment", "production"] });
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
      "production",
      "SHARED",
      sharedValue,
    ],
    ["deploy", "--environment", "production"],
  ]);
  expect(
    result.interactions
      .filter(({ tool }) => tool === "secretspec")
      .map(({ args }) => args[0]),
  ).toEqual(["schema", "export", "check", "check"]);
});

test.each([
  { args: ["--environment", ""] },
  { args: ["-e", "production", "--environment=staging"] },
])(
  "invalid or duplicate target %j fails before any tool call",
  async ({ args }) => {
    const result = await runWorkflow({ args });
    expect(result.exitCode).not.toBe(0);
    expect(result.interactions).toEqual([]);
    expect(result.stderr).toContain("environment option validation");
    expect(result.stdout).toBe("");
  },
);

test("site and product defaults stay local and never become deployment flags or uploads", async () => {
  const result = await runWorkflow({
    spec: deploymentSpec.replace(
      "[profiles.default]",
      "[profiles.default]\nFORGE_SITE = { required = true }\nFORGE_PRODUCT = { required = true }",
    ),
    schema: {
      ...deploymentSchema,
      properties: {
        ...deploymentSchema.properties,
        FORGE_SITE: { type: "string" },
        FORGE_PRODUCT: { type: "string" },
      },
    },
    values: {
      ...deploymentValues,
      FORGE_SITE: "synthetic.atlassian.net",
      FORGE_PRODUCT: "jira",
    },
    args: ["--non-interactive"],
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
    ["deploy", "--environment", "staging", "--non-interactive"],
  ]);
});
