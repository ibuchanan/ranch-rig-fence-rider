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
    { FORGE_ENVIRONMENT: "staging", SHARED: sharedValue },
    { ...deploymentValues, OPTIONAL: "bad\u0000value" },
    { ...deploymentValues, UNDECLARED: sharedValue },
    { ...deploymentValues, FORGE_ENVIRONMENT: "--unsafe-target" },
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
  expect(match.interactions.at(-1)?.args[0]).toBe("variables");
});

test("rejects control-variable upload selection and unsupported runtime inputs before any upload", async () => {
  for (const options of [
    {
      spec: deploymentSpec.replace(
        '["SHARED", "OPTIONAL"]',
        '["SHARED", "FORGE_ENVIRONMENT"]',
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
  { name: "object", value: { secret: sharedValue } },
  { name: "empty runtime", value: "" },
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
