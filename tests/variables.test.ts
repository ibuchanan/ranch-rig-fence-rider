import { expect, test } from "bun:test";
import { readdirSync } from "node:fs";
import { useBuiltCli } from "./support/cli.ts";
import {
  deploymentSchema,
  deploymentSpec,
  deploymentValues,
  runWorkflow,
  sharedValue,
} from "./support/fixtures.ts";

useBuiltCli();

test("variables refuses Forge options before any tool call", async () => {
  for (const args of [
    ["--non-interactive"],
    ["--", "-x"],
    ["-e", "production", "--verbose"],
  ]) {
    const result = await runWorkflow({ args });
    expect(result.exitCode).toBe(1);
    expect(result.interactions).toEqual([]);
    expect(result.stderr).toContain("environment option validation");
  }
});

test.each(["secretspec", "forge"])(
  "missing %s stops before any helper interaction",
  async (missingTool) => {
    const result = await runWorkflow({ missingTool });
    expect(result.exitCode).not.toBe(0);
    expect(result.interactions).toEqual([]);
    expect(result.stderr).toContain(missingTool);
    expect(result.stderr).toContain("PATH");
  },
);

test("variables resolves once and encrypts only runtime values for the configured target", async () => {
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
  for (const call of result.interactions.filter(
    ({ tool }) => tool === "forge",
  )) {
    expect(call.values).toEqual(deploymentValues);
  }
  expect(result.stdout + result.stderr).not.toContain("synthetic local-only");
  expect(readdirSync(result.project).sort()).toEqual([
    "bin",
    "manifest.yml",
    "secretspec.toml",
    "tool-calls",
  ]);
});

test.each(["FORGE_ENVIRONMENT", "FORGE_SITE", "FORGE_PRODUCT"])(
  "%s cannot be selected for upload even with an explicit target",
  async (control) => {
    const result = await runWorkflow({
      spec: deploymentSpec
        .replace(
          "[profiles.default]",
          `[profiles.default]\n${control === "FORGE_ENVIRONMENT" ? "" : `${control} = { required = true }`}`,
        )
        .replace('["SHARED", "OPTIONAL"]', `["SHARED", "${control}"]`),
      schema: {
        ...deploymentSchema,
        properties: {
          ...deploymentSchema.properties,
          [control]: { type: "string" },
        },
      },
      values: { ...deploymentValues, [control]: "staging" },
      args: ["-e", "production"],
    });
    expect(result.exitCode).not.toBe(0);
    expect(result.interactions.filter(({ tool }) => tool === "forge")).toEqual(
      [],
    );
    expect(result.stderr).toContain("runtime selection validation");
  },
);

test("variables emits safe stage progress without forwarding helper streams", async () => {
  const result = await runWorkflow();
  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain(
    "Fence Rider: encrypted upload for SHARED (target staging).",
  );
  expect(result.stdout).toContain("Uploaded 1 runtime variable(s).");
  expect(result.stdout + result.stderr).not.toContain("synthetic helper noise");
});

test("omitted runtime scope and empty active-profile intersection upload nothing and delete nothing", async () => {
  for (const spec of [
    deploymentSpec.split("[scopes.runtime]")[0],
    `${deploymentSpec.replace('["SHARED", "OPTIONAL"]', '["OTHER_PROFILE_VALUE"]')}\n[profiles.other]\nOTHER_PROFILE_VALUE = { description = "Not active" }\n`,
  ]) {
    const result = await runWorkflow({ spec: spec ?? "" });
    expect(result.exitCode).toBe(0);
    expect(result.interactions.filter(({ tool }) => tool === "forge")).toEqual(
      [],
    );
    expect(result.stdout).toContain("Uploaded 0 runtime variable(s).");
    expect(
      result.interactions
        .filter(({ tool }) => tool === "secretspec")
        .map(({ args }) => args[0]),
    ).toEqual(["schema", "export", "check", "check"]);
  }
});

test("missing configured target falls back to development for uploads", async () => {
  const result = await runWorkflow({
    values: { SHARED: sharedValue, LOCAL_ONLY: "synthetic local-only" },
    schema: { ...deploymentSchema, required: ["SHARED", "LOCAL_ONLY"] },
  });
  expect(result.exitCode).toBe(0);
  const forge = result.interactions.filter(({ tool }) => tool === "forge");
  expect(
    forge.map(({ args }) => args[args.indexOf("--environment") + 1]),
  ).toEqual(["development"]);
});

test("every runtime value is encrypted in declaration order", async () => {
  const result = await runWorkflow({
    values: { ...deploymentValues, OPTIONAL: "second synthetic value" },
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
    [
      "variables",
      "set",
      "--encrypt",
      "--environment",
      "staging",
      "OPTIONAL",
      "second synthetic value",
    ],
  ]);
});
