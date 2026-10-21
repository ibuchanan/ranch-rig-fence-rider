import { expect, test } from "bun:test";
import { useBuiltCli } from "./support/cli.ts";
import {
  canonicalSchema,
  canonicalSpec,
  canonicalValues,
  deploymentSchema,
  deploymentSpec,
  deploymentValues,
  runWorkflow,
  sharedValue,
} from "./support/fixtures.ts";

useBuiltCli();

test("canonical environment selects the same target for encrypted uploads and one deployment", async () => {
  const result = await runWorkflow({
    spec: canonicalSpec,
    schema: canonicalSchema,
    values: canonicalValues,
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
  ).toEqual(["schema", "export"]);
  for (const call of result.interactions.filter(
    ({ tool }) => tool === "forge",
  )) {
    expect(call.values).toEqual(canonicalValues);
  }
});

test.each([{ args: [] }, { args: ["--environment", "production"] }])(
  "conflicting environment names fail before Forge even with override %j",
  async ({ args }) => {
    const result = await runWorkflow({
      spec: canonicalSpec.replace(
        "[profiles.default]",
        '[profiles.default]\nFORGE_ENV = { description = "Legacy target" }',
      ),
      schema: {
        ...canonicalSchema,
        properties: {
          ...canonicalSchema.properties,
          FORGE_ENV: { type: "string" },
        },
      },
      values: { ...canonicalValues, FORGE_ENV: "conflicting-synthetic-target" },
      args,
    });
    expect(result.exitCode).not.toBe(0);
    expect(result.interactions.filter(({ tool }) => tool === "forge")).toEqual(
      [],
    );
    expect(result.interactions.map(({ args }) => args[0])).toEqual([
      "schema",
      "export",
    ]);
    expect(result.stderr).toContain("FORGE_ENVIRONMENT and FORGE_ENV conflict");
    expect(result.stdout).toBe("");
    expect(result.stderr).not.toContain("conflicting-synthetic-target");
    expect(result.stderr).not.toContain(
      "Remote variables may already have changed",
    );
  },
);

test.each([
  { name: "canonical", legacy: false, args: ["-e", "production"] },
  { name: "matching dual", legacy: true, args: [] },
  {
    name: "matching dual override",
    legacy: true,
    args: ["--environment=production"],
  },
])(
  "$name environment controls preserve selection and child values",
  async ({ legacy, args }) => {
    const result = await runWorkflow({
      spec: legacy
        ? canonicalSpec.replace(
            "[profiles.default]",
            '[profiles.default]\nFORGE_ENV = { description = "Legacy target" }',
          )
        : canonicalSpec,
      schema: {
        ...canonicalSchema,
        properties: {
          ...canonicalSchema.properties,
          ...(legacy ? { FORGE_ENV: { type: "string" } } : {}),
        },
      },
      values: {
        ...canonicalValues,
        ...(legacy ? { FORGE_ENV: "staging" } : {}),
      },
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
    expect(forge.at(-1)?.values).toEqual({
      ...canonicalValues,
      ...(legacy ? { FORGE_ENV: "staging" } : {}),
    });
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
  ).toEqual(["schema", "export"]);
});

test.each([
  { args: ["-e", "release_42"] },
  { args: ["--environment=release_42"] },
  { args: ["-erelease_42"] },
])(
  "verified target form %j reaches uploads and deployment",
  async ({ args }) => {
    const result = await runWorkflow({ args });
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
        "release_42",
        "SHARED",
        sharedValue,
      ],
      ["deploy", "--environment", "release_42"],
    ]);
  },
);

test.each([
  { args: ["--environment"] },
  { args: ["-e"] },
  { args: ["--environment="] },
  { args: ["--environment", ""] },
  { args: ["--environment", "--non-interactive"] },
  { args: ["-e", "--"] },
  { args: ["-e=production"] },
  { args: ["-e", "production", "--environment=staging"] },
  { args: ["--environment=production", "-eproduction"] },
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

test.each([
  { args: ["--", "--environment", "production", "-e", "other"] },
  {
    args: [
      "--tag=--environment=production",
      "--major-version",
      "3",
      "--non-interactive",
    ],
  },
  { args: ["-t--environment=production", "-v3", "--non-interactive"] },
])("target-like payloads remain untouched %j", async ({ args }) => {
  const result = await runWorkflow({ args });
  expect(result.exitCode).toBe(0);
  expect(
    result.interactions
      .filter(({ tool }) => tool === "forge")
      .map(({ args: callArgs }) => callArgs),
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
    ["deploy", "--environment", "staging", ...args],
  ]);
});

test("explicit target precedes the terminator and leaves target-like payloads untouched", async () => {
  const result = await runWorkflow({
    args: [
      "--non-interactive",
      "--environment=production",
      "--",
      "--environment",
      "payload",
    ],
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
    [
      "deploy",
      "--environment",
      "production",
      "--non-interactive",
      "--",
      "--environment",
      "payload",
    ],
  ]);
});

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
