import { describe, expect, test } from "bun:test";
import {
  manifestKeys,
  parseMembers,
  parseResolved,
  unrecognizedScopes,
} from "../../src/resolution.ts";
import {
  deploymentSchema,
  deploymentValues,
  hostileValue,
} from "../support/fixtures.ts";

describe("scope membership", () => {
  test("names come from the value-free report in order", () => {
    expect(
      parseMembers({
        schema_version: 1,
        scope: "runtime",
        secrets: [
          { name: "OPTIONAL", status: "missing_optional" },
          { name: "SHARED", status: "resolved" },
        ],
      }),
    ).toEqual(["OPTIONAL", "SHARED"]);
  });

  test("a scope with no secrets has no members", () => {
    expect(parseMembers({ secrets: [] })).toEqual([]);
  });

  test.each([
    { report: null },
    { report: [] },
    { report: {} },
    { report: { secrets: "SHARED" } },
    { report: { secrets: [null] } },
    { report: { secrets: [{}] } },
    { report: { secrets: [{ name: 1 }] } },
  ])("a malformed report $report is rejected", ({ report }) => {
    expect(() => parseMembers(report)).toThrow("Malformed scope report");
  });
});

describe("recognized scopes", () => {
  test("only scopes other than manifest and runtime are reported", () => {
    expect(
      unrecognizedScopes(["manifest", "api", "runtime", "runtim"]),
    ).toEqual(["api", "runtim"]);
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
          [hostileValue]: { type: "string" },
        },
      },
    },
  ])("malformed schema: $name is rejected", ({ schema }) => {
    expect(() => parseResolved(schema, deploymentValues)).toThrow();
  });

  test.each([
    { name: "null export", exported: null },
    { name: "array export", exported: [] },
    { name: "string export", exported: hostileValue },
  ])("malformed export: $name is rejected", ({ exported }) => {
    expect(() => parseResolved(deploymentSchema, exported)).toThrow(
      "Malformed export output",
    );
  });

  test.each([
    { name: "null", value: null },
    { name: "number zero", value: 0 },
    { name: "boolean false", value: false },
    { name: "array", value: [hostileValue] },
    { name: "object", value: { secret: hostileValue } },
    { name: "NUL", value: `before\u0000${hostileValue}` },
  ])("resolved value $name is rejected", ({ value }) => {
    expect(() =>
      parseResolved(deploymentSchema, { ...deploymentValues, OPTIONAL: value }),
    ).toThrow("NUL-free string");
  });

  test("a value outside the schema is rejected", () => {
    expect(() =>
      parseResolved(deploymentSchema, {
        ...deploymentValues,
        UNDECLARED: hostileValue,
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
