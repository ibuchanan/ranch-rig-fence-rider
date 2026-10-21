import { expect, test } from "bun:test";
import {
  deploymentSchema,
  deploymentSpec,
  deploymentValues,
  sharedValue,
} from "../support/fixtures.ts";
import { runInProcess } from "../support/fake-io.ts";

test("canonical environment selects the target for encrypted uploads", async () => {
  const result = await runInProcess({
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
  ]);
  expect(
    result.interactions
      .filter(({ tool }) => tool === "secretspec")
      .map(({ args }) => args[0]),
  ).toEqual(["schema", "export", "check", "check"]);
  expect(
    result.interactions
      .filter(({ tool }) => tool === "forge")
      .map(({ values }) => values),
  ).toEqual([deploymentValues]);
});

test.each([
  { name: "short override", args: ["-e", "production"] },
  { name: "long override", args: ["--environment=production"] },
  { name: "configured default", args: [] },
])(
  "$name environment control preserves selection and child values",
  async ({ args }) => {
    const result = await runInProcess({
      spec: deploymentSpec,
      schema: deploymentSchema,
      values: deploymentValues,
      args,
    });
    expect(result.exitCode).toBe(0);
    const forge = result.interactions.filter(({ tool }) => tool === "forge");
    expect(
      forge.map(({ args }) => args[args.indexOf("--environment") + 1]),
    ).toEqual(args.length ? ["production"] : ["staging"]);
    expect(forge.map(({ args }) => args[0])).toEqual(["variables"]);
    expect(forge.at(-1)?.values).toEqual(deploymentValues);
  },
);

test("explicit environment overrides the configured target for the upload", async () => {
  const result = await runInProcess({ args: ["--environment", "production"] });
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
    const result = await runInProcess({ args });
    expect(result.exitCode).not.toBe(0);
    expect(result.interactions).toEqual([]);
    expect(result.stderr).toContain("environment option validation");
    expect(result.stdout).toBe("");
  },
);

test("site and product defaults stay local and are never uploaded", async () => {
  const result = await runInProcess({
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
  ]);
});
