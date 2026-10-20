import { expect, test } from "bun:test";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { useBuiltCli } from "./support/cli.ts";
import {
  deploymentSchema,
  deploymentSpec,
  deploymentValues,
  runWorkflow,
  sharedValue,
} from "./support/fixtures.ts";

useBuiltCli();

test("deployment preserves unrelated options and CI arguments without changing boundaries", async () => {
  const forwarded = [
    "--non-interactive",
    "--tag",
    sharedValue,
    "--verbose",
    "--approve",
    "MAJOR_VERSION_RULE",
    "OTHER_RULE",
    "--major-version",
    "4",
    "--inspect",
    "--no-verify",
    "--skip-rollout",
    "--future-option=value",
  ];
  const result = await runWorkflow({
    args: [...forwarded.slice(0, 3), "-e", "production", ...forwarded.slice(3)],
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
      "production",
      "SHARED",
      sharedValue,
    ],
    ["deploy", "--environment", "production", ...forwarded],
  ]);
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

test("deploy resolves once, encrypts only runtime values, then deploys to the configured target", async () => {
  const result = await runWorkflow();
  expect(result.exitCode).toBe(0);
  expect(result.interactions.map(({ tool, args }) => [tool, ...args])).toEqual([
    [
      "secretspec",
      "schema",
      "--file",
      join(result.project, "secretspec.toml"),
      "--profile",
      "default",
    ],
    [
      "secretspec",
      "export",
      "--file",
      join(result.project, "secretspec.toml"),
      "--profile",
      "default",
      "--scope",
      "",
      "--format",
      "json",
    ],
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
    ["forge", "deploy", "--environment", "staging"],
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

test.each(["FORGE_ENVIRONMENT", "FORGE_ENV", "FORGE_SITE", "FORGE_PRODUCT"])(
  "%s cannot be selected for upload even with an explicit target",
  async (control) => {
    const result = await runWorkflow({
      spec: deploymentSpec
        .replace(
          "[profiles.default]",
          `[profiles.default]\n${control === "FORGE_ENV" ? "" : `${control} = { required = true }`}`,
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

test("deployment emits safe stage progress without forwarding helper streams", async () => {
  const result = await runWorkflow();
  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain(
    "Fence Rider: encrypted upload for SHARED (target staging).",
  );
  expect(result.stdout).toContain("Fence Rider: deployment (target staging).");
  expect(result.stdout).toContain("Deployment completed.");
  expect(result.stdout + result.stderr).not.toContain("synthetic helper noise");
});

test("omitted runtime scope and empty active-profile intersection deploy without writes or deletion", async () => {
  for (const spec of [
    deploymentSpec.split("[scopes.runtime]")[0],
    `${deploymentSpec.replace('["SHARED", "OPTIONAL"]', '["OTHER_PROFILE_VALUE"]')}\n[profiles.other]\nOTHER_PROFILE_VALUE = { description = "Not active" }\n`,
  ]) {
    const result = await runWorkflow({ spec: spec ?? "" });
    expect(result.exitCode).toBe(0);
    expect(
      result.interactions
        .filter(({ tool }) => tool === "forge")
        .map(({ args }) => args),
    ).toEqual([["deploy", "--environment", "staging"]]);
    expect(
      result.interactions
        .filter(({ tool }) => tool === "secretspec")
        .map(({ args }) => args[0]),
    ).toEqual(["schema", "export"]);
  }
});

test("missing configured target falls back to development for uploads and deployment", async () => {
  const result = await runWorkflow({
    values: { SHARED: sharedValue, LOCAL_ONLY: "synthetic local-only" },
    schema: { ...deploymentSchema, required: ["SHARED", "LOCAL_ONLY"] },
  });
  expect(result.exitCode).toBe(0);
  const forge = result.interactions.filter(({ tool }) => tool === "forge");
  expect(
    forge.map(({ args }) => args[args.indexOf("--environment") + 1]),
  ).toEqual(["development", "development"]);
});

test("empty extends is accepted without changing the single-file deployment", async () => {
  const result = await runWorkflow({
    spec: deploymentSpec.replace(
      'revision = "1.0"',
      'revision = "1.0"\nextends = []',
    ),
  });
  expect(result.exitCode).toBe(0);
  expect(result.interactions.at(-1)?.args).toEqual([
    "deploy",
    "--environment",
    "staging",
  ]);
});

test("all encrypted writes complete before exactly one deployment", async () => {
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
    ["deploy", "--environment", "staging"],
  ]);
});
