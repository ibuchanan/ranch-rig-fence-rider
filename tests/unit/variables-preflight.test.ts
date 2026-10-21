import { expect, test } from "bun:test";
import {
  deploymentSchema,
  deploymentSpec,
  deploymentValues,
  sharedValue,
} from "../support/fixtures.ts";
import { runInProcess } from "../support/fake-io.ts";

test.each([
  { name: "null schema", options: { schema: null } },
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
  { name: "string export", options: { values: sharedValue } },
  { name: "broken schema JSON", options: { schemaOutput: `{${sharedValue}` } },
  { name: "broken export JSON", options: { exportOutput: `{${sharedValue}` } },
])(
  "malformed native output: $name stops before all Forge commands",
  async ({ options }) => {
    const result = await runInProcess({
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
  const result = await runInProcess({
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

test.each([
  {
    name: "non-string value",
    values: { ...deploymentValues, OPTIONAL: { secret: sharedValue } },
  },
  {
    name: "missing required declaration",
    values: { FORGE_ENVIRONMENT: "staging", SHARED: sharedValue },
  },
  {
    name: "NUL byte in value",
    values: { ...deploymentValues, OPTIONAL: "bad\u0000value" },
  },
  {
    name: "undeclared value",
    values: { ...deploymentValues, UNDECLARED: sharedValue },
  },
  {
    name: "option-like target",
    values: { ...deploymentValues, FORGE_ENVIRONMENT: "--unsafe-target" },
  },
])(
  "invalid resolved values ($name) are rejected before the first upload",
  async ({ values }) => {
    const result = await runInProcess({ values });
    expect(result.exitCode).not.toBe(0);
    expect(result.interactions.filter(({ tool }) => tool === "forge")).toEqual(
      [],
    );
    expect(result.stderr).toContain("validation");
  },
);

test("manifest scope checks declarations including absent optionals before uploads", async () => {
  const spec = `${deploymentSpec}\n[scopes.manifest]\nsecrets = ["SHARED", "OPTIONAL"]\n`;
  const mismatch = await runInProcess({
    spec,
    manifest: "environment:\n  variables:\n    - SHARED\n",
  });
  expect(mismatch.exitCode).not.toBe(0);
  expect(mismatch.interactions.filter(({ tool }) => tool === "forge")).toEqual(
    [],
  );
  expect(mismatch.stderr).toContain("manifest");
  expect(mismatch.stderr).toContain("OPTIONAL");
  const match = await runInProcess({
    spec,
    manifest:
      "environment:\n  variables:\n    - SHARED\n    - key: OPTIONAL\n      default: fallback\n",
  });
  expect(match.exitCode).toBe(0);
  expect(match.interactions.at(-1)?.args[0]).toBe("variables");
});

test.each([
  {
    name: "control variable in runtime scope",
    options: {
      spec: deploymentSpec.replace(
        '["SHARED", "OPTIONAL"]',
        '["SHARED", "FORGE_ENVIRONMENT"]',
      ),
    },
  },
  {
    name: "empty runtime value",
    options: { values: { ...deploymentValues, OPTIONAL: "" } },
  },
  {
    name: "option-like runtime value",
    options: {
      values: { ...deploymentValues, OPTIONAL: "--option-like-value" },
    },
  },
])("$name is rejected before any upload", async ({ options }) => {
  const result = await runInProcess(options);
  expect(result.exitCode).not.toBe(0);
  expect(result.interactions.filter(({ tool }) => tool === "forge")).toEqual(
    [],
  );
  expect(result.stderr).toContain("runtime selection");
});

test.each([
  { name: "object", value: { secret: sharedValue } },
  { name: "empty runtime", value: "" },
])(
  "late invalid runtime value: $name prevents the earlier valid upload",
  async ({ value }) => {
    const result = await runInProcess({
      values: { ...deploymentValues, OPTIONAL: value },
    });
    expect(result.exitCode).not.toBe(0);
    expect(result.interactions.filter(({ tool }) => tool === "forge")).toEqual(
      [],
    );
    expect(result.stdout).toBe("");
  },
);

test.each(
  ["SHARED", "LOCAL_ONLY"].flatMap((key) =>
    [false, true].map((withRuntime) => ({ key, withRuntime })),
  ),
)(
  "missing required $key blocks writes (runtime selection: $withRuntime)",
  async ({ key, withRuntime }) => {
    const values: Record<string, unknown> = { ...deploymentValues };
    delete values[key];
    const result = await runInProcess({
      spec: `${withRuntime ? deploymentSpec : deploymentSpec.split("[scopes.runtime]")[0]}\n[scopes.manifest]\nsecrets = ["LOCAL_ONLY"]\n`,
      values,
      manifest: "environment:\n  variables: [LOCAL_ONLY]\n",
    });
    expect(result.exitCode).not.toBe(0);
    expect(result.interactions.filter(({ tool }) => tool === "forge")).toEqual(
      [],
    );
    expect(result.stderr).toContain("resolved value validation");
  },
);

test("omitted manifest scope does not require a manifest file or suppress local values", async () => {
  const result = await runInProcess({ manifest: null });
  expect(result.exitCode).toBe(0);
  expect(result.interactions.at(-1)?.values).toEqual(deploymentValues);
});

test.each([
  { name: "invalid TOML", spec: `not valid TOML ${sharedValue}` },
  { name: "missing specification", env: { SECRETSPEC_FILE: "missing.toml" } },
])(
  "invalid configuration: $name fails with secret-safe diagnostics",
  async ({ spec, env }) => {
    const result = await runInProcess({
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
