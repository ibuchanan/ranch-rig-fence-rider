import { describe, expect, test } from "bun:test";
import {
  manifestKeys,
  members,
  parseInheritance,
  parseResolved,
  parseScopes,
} from "../src/resolution.ts";
import {
  deploymentSchema,
  deploymentSpec,
  deploymentValues,
  sharedValue,
} from "./support/fixtures.ts";

const toml = (text: string) => Bun.TOML.parse(text);
const withProject = (declaration: string) =>
  toml(
    deploymentSpec.replace(
      'revision = "1.0"',
      `revision = "1.0"\n${declaration}`,
    ),
  );

describe("project.extends", () => {
  test("absent or empty inheritance is accepted", () => {
    expect(() => parseInheritance(toml(deploymentSpec))).not.toThrow();
    expect(() => parseInheritance(withProject("extends = []"))).not.toThrow();
  });

  test.each([
    'extends = ["parent.toml"]',
    'extends = "parent.toml"',
    "extends = [42]",
  ])("%s is rejected", (declaration) => {
    expect(() => parseInheritance(withProject(declaration))).toThrow(
      "project.extends",
    );
  });
});

describe("scope metadata", () => {
  const scoped = (metadata: string) =>
    toml(deploymentSpec.replace('secrets = ["SHARED", "OPTIONAL"]', metadata));

  test("valid scopes keep their declared secrets", () => {
    expect(parseScopes(toml(deploymentSpec))).toEqual({
      scopes: { runtime: { secrets: ["SHARED", "OPTIONAL"] } },
    });
  });

  test("a spec without scopes has none", () => {
    expect(parseScopes({})).toEqual({});
  });

  test.each([
    "secrets = []",
    'secrets = "SHARED"',
    'secrets = ["SHARED", "SHARED"]',
    'secrets = [" "]',
    "secrets = [42]",
    'secrets = ["UNDECLARED"]',
    'secrets = ["SHARED"]\nextra = true',
  ])("malformed metadata %s is rejected", (metadata) => {
    expect(() => parseScopes(scoped(metadata))).toThrow("Malformed scope");
  });

  test("a non-table scopes value is rejected", () => {
    expect(() => parseScopes(toml(`scopes = "invalid"`))).toThrow(
      "Malformed scopes",
    );
  });
});

describe("members", () => {
  test("keeps only declarations present in the active profile schema", () => {
    const config = parseScopes(toml(deploymentSpec));
    expect(members(config, "runtime", { SHARED: {} })).toEqual(["SHARED"]);
    expect(members(config, "missing-scope", { SHARED: {} })).toEqual([]);
  });
});

describe("native schema and export output", () => {
  test("well-formed output yields properties and string values", () => {
    const { properties, values } = parseResolved(
      deploymentSchema,
      deploymentValues,
    );
    expect(Object.keys(properties)).toContain("OPTIONAL");
    expect(values).toEqual(deploymentValues);
  });

  test.each([
    { name: "null schema", schema: null },
    { name: "array schema", schema: [] },
    { name: "array properties", schema: { type: "object", properties: [] } },
    { name: "wrong root type", schema: { ...deploymentSchema, type: "array" } },
    {
      name: "null property",
      schema: {
        ...deploymentSchema,
        properties: { ...deploymentSchema.properties, OPTIONAL: null },
      },
    },
    {
      name: "numeric property",
      schema: {
        ...deploymentSchema,
        properties: {
          ...deploymentSchema.properties,
          OPTIONAL: { type: "number" },
        },
      },
    },
    { name: "null required", schema: { ...deploymentSchema, required: null } },
    {
      name: "string required",
      schema: { ...deploymentSchema, required: "SHARED" },
    },
    {
      name: "non-string required",
      schema: { ...deploymentSchema, required: [42] },
    },
    {
      name: "unknown required",
      schema: { ...deploymentSchema, required: ["UNKNOWN"] },
    },
    {
      name: "duplicate required",
      schema: { ...deploymentSchema, required: ["SHARED", "SHARED"] },
    },
    {
      name: "invalid key",
      schema: {
        ...deploymentSchema,
        properties: {
          ...deploymentSchema.properties,
          [sharedValue]: { type: "string" },
        },
      },
    },
  ])("malformed schema: $name is rejected", ({ schema }) => {
    expect(() => parseResolved(schema, deploymentValues)).toThrow();
  });

  test.each([
    { name: "null export", exported: null },
    { name: "array export", exported: [] },
    { name: "string export", exported: sharedValue },
  ])("malformed export: $name is rejected", ({ exported }) => {
    expect(() => parseResolved(deploymentSchema, exported)).toThrow(
      "Malformed export output",
    );
  });

  test.each([
    { name: "null", value: null },
    { name: "number zero", value: 0 },
    { name: "boolean false", value: false },
    { name: "array", value: [sharedValue] },
    { name: "object", value: { secret: sharedValue } },
    { name: "NUL", value: `before\u0000${sharedValue}` },
  ])("resolved value $name is rejected", ({ value }) => {
    expect(() =>
      parseResolved(deploymentSchema, { ...deploymentValues, OPTIONAL: value }),
    ).toThrow("NUL-free string");
  });

  test("a value outside the schema is rejected", () => {
    expect(() =>
      parseResolved(deploymentSchema, {
        ...deploymentValues,
        UNDECLARED: sharedValue,
      }),
    ).toThrow("not in the schema");
  });

  test.each(["SHARED", "LOCAL_ONLY"])(
    "missing required %s is rejected",
    (key) => {
      const { [key]: _omitted, ...rest } = deploymentValues as Record<
        string,
        string
      >;
      expect(() => parseResolved(deploymentSchema, rest)).toThrow(
        "Missing required value",
      );
    },
  );

  test.each(["", "--option-like", "0", "false"])(
    "string %j is a valid resolved value",
    (value) => {
      expect(
        parseResolved(deploymentSchema, {
          ...deploymentValues,
          OPTIONAL: value,
        }).values["OPTIONAL"],
      ).toBe(value);
    },
  );
});

describe("manifest declarations", () => {
  test("collects string and keyed entries", () => {
    expect(
      manifestKeys({
        environment: {
          variables: ["SHARED", { key: "OPTIONAL", default: "x" }],
        },
      }),
    ).toEqual(new Set(["SHARED", "OPTIONAL"]));
  });

  test.each([{}, null, { environment: {} }])(
    "a manifest without variables, %j, declares nothing",
    (manifest) => {
      expect(manifestKeys(manifest).size).toBe(0);
    },
  );

  test("a non-list variables declaration is rejected", () => {
    expect(() =>
      manifestKeys({ environment: { variables: "SHARED" } }),
    ).toThrow("not a list");
  });
});
