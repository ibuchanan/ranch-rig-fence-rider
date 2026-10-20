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

test.each([
  { declaration: 'extends = ["parent.toml"]', context: "project.extends" },
  { declaration: 'extends = "parent.toml"', context: "project.extends" },
  { declaration: "extends = [42]", context: "project.extends" },
])(
  "rejects unsupported or malformed inheritance $declaration before helper interaction",
  async ({ declaration, context }) => {
    const result = await runWorkflow({
      spec: deploymentSpec.replace(
        'revision = "1.0"',
        `revision = "1.0"\n${declaration}`,
      ),
      files: { "parent.toml": deploymentSpec },
    });
    expect(result.exitCode).not.toBe(0);
    expect(result.interactions).toEqual([]);
    expect(result.stderr).toContain(context);
  },
);

test.each([
  "secrets = []",
  'secrets = "SHARED"',
  'secrets = ["SHARED", "SHARED"]',
  'secrets = [" "]',
  "secrets = [42]",
  'secrets = ["UNDECLARED"]',
  'secrets = ["SHARED"]\nextra = true',
])(
  "rejects malformed scope metadata %s before helper interaction",
  async (metadata) => {
    const result = await runWorkflow({
      spec: deploymentSpec.replace(
        'secrets = ["SHARED", "OPTIONAL"]',
        metadata,
      ),
    });
    expect(result.exitCode).not.toBe(0);
    expect(result.interactions).toEqual([]);
    expect(result.stderr).toContain("scope metadata");
  },
);

test.each([
  { name: "null schema", options: { schema: null } },
  { name: "array schema", options: { schema: [] } },
  {
    name: "array properties",
    options: { schema: { type: "object", properties: [] } },
  },
  {
    name: "wrong root type",
    options: { schema: { ...deploymentSchema, type: "array" } },
  },
  {
    name: "null property",
    options: {
      schema: {
        ...deploymentSchema,
        properties: { ...deploymentSchema.properties, OPTIONAL: null },
      },
    },
  },
  {
    name: "numeric property",
    options: {
      schema: {
        ...deploymentSchema,
        properties: {
          ...deploymentSchema.properties,
          OPTIONAL: { type: "number" },
        },
      },
    },
  },
  {
    name: "null required",
    options: { schema: { ...deploymentSchema, required: null } },
  },
  {
    name: "string required",
    options: { schema: { ...deploymentSchema, required: "SHARED" } },
  },
  {
    name: "non-string required",
    options: { schema: { ...deploymentSchema, required: [42] } },
  },
  {
    name: "unknown required",
    options: { schema: { ...deploymentSchema, required: ["UNKNOWN"] } },
  },
  {
    name: "duplicate required",
    options: {
      schema: { ...deploymentSchema, required: ["SHARED", "SHARED"] },
    },
  },
  {
    name: "invalid key",
    options: {
      schema: {
        ...deploymentSchema,
        properties: {
          ...deploymentSchema.properties,
          [sharedValue]: { type: "string" },
        },
      },
    },
  },
  { name: "null export", options: { values: null } },
  { name: "array export", options: { values: [] } },
  { name: "string export", options: { values: sharedValue } },
  { name: "broken schema JSON", options: { schemaOutput: `{${sharedValue}` } },
  { name: "broken export JSON", options: { exportOutput: `{${sharedValue}` } },
])(
  "malformed native output: $name stops before all Forge commands",
  async ({ options }) => {
    const result = await runWorkflow({
      ...options,
      args: ["-e", "production"],
    });
    expect(result.exitCode).not.toBe(0);
    expect(result.interactions.filter(({ tool }) => tool === "forge")).toEqual(
      [],
    );
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("target production");
    expect(result.stderr).not.toContain("synthetic helper noise");
  },
);

test("preflight failures retain a validated explicit target without leaking invalid values", async () => {
  const result = await runWorkflow({
    args: ["-e", "production"],
    values: { ...deploymentValues, OPTIONAL: { secret: sharedValue } },
  });
  expect(result.exitCode).not.toBe(0);
  expect(result.interactions.filter(({ tool }) => tool === "forge")).toEqual(
    [],
  );
  expect(result.stderr).toContain("resolved value validation");
  expect(result.stderr).toContain("target production");
});

test("validates every resolved value and required declaration before the first upload", async () => {
  for (const values of [
    { ...deploymentValues, OPTIONAL: { secret: sharedValue } },
    { FORGE_ENV: "staging", SHARED: sharedValue },
    { ...deploymentValues, OPTIONAL: "bad\u0000value" },
    { ...deploymentValues, UNDECLARED: sharedValue },
    { ...deploymentValues, FORGE_ENV: "--unsafe-target" },
  ]) {
    const result = await runWorkflow({ values });
    expect(result.exitCode).not.toBe(0);
    expect(result.interactions.filter(({ tool }) => tool === "forge")).toEqual(
      [],
    );
    expect(result.stderr).toContain("validation");
  }
});

test("manifest scope checks declarations including absent optionals before uploads", async () => {
  const spec = `${deploymentSpec}\n[scopes.manifest]\nsecrets = ["SHARED", "OPTIONAL"]\n`;
  const mismatch = await runWorkflow({
    spec,
    manifest: "environment:\n  variables:\n    - SHARED\n",
  });
  expect(mismatch.exitCode).not.toBe(0);
  expect(mismatch.interactions.filter(({ tool }) => tool === "forge")).toEqual(
    [],
  );
  expect(mismatch.stderr).toContain("manifest");
  expect(mismatch.stderr).toContain("OPTIONAL");
  const match = await runWorkflow({
    spec,
    manifest:
      "environment:\n  variables:\n    - SHARED\n    - key: OPTIONAL\n      default: fallback\n",
  });
  expect(match.exitCode).toBe(0);
  expect(match.interactions.at(-1)?.args).toEqual([
    "deploy",
    "--environment",
    "staging",
  ]);
});

test("rejects control-variable upload selection and unsupported runtime inputs before any upload", async () => {
  for (const options of [
    {
      spec: deploymentSpec.replace(
        '["SHARED", "OPTIONAL"]',
        '["SHARED", "FORGE_ENV"]',
      ),
    },
    { values: { ...deploymentValues, OPTIONAL: "" } },
    { values: { ...deploymentValues, OPTIONAL: "--option-like-value" } },
  ]) {
    const result = await runWorkflow(options);
    expect(result.exitCode).not.toBe(0);
    expect(result.interactions.filter(({ tool }) => tool === "forge")).toEqual(
      [],
    );
    expect(result.stderr).toContain("runtime selection");
  }
});

test.each([
  { name: "null", value: null },
  { name: "number zero", value: 0 },
  { name: "boolean false", value: false },
  { name: "array", value: [sharedValue] },
  { name: "object", value: { secret: sharedValue } },
  { name: "NUL", value: `before\u0000${sharedValue}` },
  { name: "empty runtime", value: "" },
  { name: "leading dash", value: "--synthetic" },
])(
  "late invalid runtime value: $name prevents the earlier valid upload",
  async ({ value }) => {
    const result = await runWorkflow({
      values: { ...deploymentValues, OPTIONAL: value },
    });
    expect(result.exitCode).not.toBe(0);
    expect(result.interactions.filter(({ tool }) => tool === "forge")).toEqual(
      [],
    );
    expect(result.stdout).toBe("");
  },
);

test.each(["SHARED", "LOCAL_ONLY"])(
  "missing required %s blocks writes even without runtime selection",
  async (key) => {
    for (const withRuntime of [false, true]) {
      const values: Record<string, unknown> = { ...deploymentValues };
      delete values[key];
      const result = await runWorkflow({
        spec: `${withRuntime ? deploymentSpec : deploymentSpec.split("[scopes.runtime]")[0]}\n[scopes.manifest]\nsecrets = ["LOCAL_ONLY"]\n`,
        values,
        manifest: "environment:\n  variables: [LOCAL_ONLY]\n",
      });
      expect(result.exitCode).not.toBe(0);
      expect(
        result.interactions.filter(({ tool }) => tool === "forge"),
      ).toEqual([]);
      expect(result.stderr).toContain("resolved value validation");
    }
  },
);

test("omitted manifest scope does not require a manifest file or suppress local values", async () => {
  const result = await runWorkflow({ manifest: null });
  expect(result.exitCode).toBe(0);
  expect(result.interactions.at(-1)?.values).toEqual(deploymentValues);
});

test.each([
  { name: "invalid TOML", spec: `not valid TOML ${sharedValue}` },
  { name: "missing specification", env: { SECRETSPEC_FILE: "missing.toml" } },
  {
    name: "malformed scope table",
    spec: `scopes = "invalid"\n${deploymentSpec}`,
  },
])(
  "invalid configuration: $name fails with secret-safe diagnostics",
  async ({ spec, env }) => {
    const result = await runWorkflow({
      ...(spec === undefined ? {} : { spec }),
      ...(env === undefined ? {} : { env }),
      args: ["-e", "production"],
    });
    expect(result.exitCode).not.toBe(0);
    expect(result.interactions.filter(({ tool }) => tool === "forge")).toEqual(
      [],
    );
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("target production");
  },
);
