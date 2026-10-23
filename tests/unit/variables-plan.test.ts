import { describe, expect, test } from "bun:test";
import { planUploads } from "../../src/variables-plan.ts";

describe("encrypted uploads", () => {
  const plan = (runtime: string[], values: Record<string, string>) =>
    planUploads({ target: "staging", runtime, values });

  test("each present runtime value gets one encrypted upload to the target, in declaration order", () => {
    expect(plan(["B", "A"], { A: "synthetic-a", B: "synthetic-b" })).toEqual([
      {
        key: "B",
        args: [
          "variables",
          "set",
          "--encrypt",
          "--environment",
          "staging",
          "B",
          "synthetic-b",
        ],
      },
      {
        key: "A",
        args: [
          "variables",
          "set",
          "--encrypt",
          "--environment",
          "staging",
          "A",
          "synthetic-a",
        ],
      },
    ]);
  });

  test("absent optional values are skipped", () => {
    expect(plan(["OPTIONAL"], {})).toEqual([]);
  });

  test.each(["FORGE_ENVIRONMENT", "FORGE_SITE", "FORGE_PRODUCT"])(
    "local control %s cannot be uploaded",
    (key) => {
      expect(() => plan([key], { [key]: "x" })).toThrow("Local control");
    },
  );

  test.each(["", "-leading-dash"])(
    "unsupported upload value %j is rejected",
    (value) => {
      expect(() => plan(["SHARED"], { SHARED: value })).toThrow(
        "Unsupported Forge positional value",
      );
    },
  );
});
