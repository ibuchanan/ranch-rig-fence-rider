import { describe, expect, test } from "bun:test";
import { tunnelPrologue } from "../../src/tunnel-plan.ts";

describe("prologue", () => {
  test.each(["FORGE_ENVIRONMENT", "FORGE_SITE", "FORGE_PRODUCT"])(
    "local control %s cannot be a runtime variable",
    (key) => {
      expect(() => tunnelPrologue([key], [key])).toThrow("Local control");
    },
  );

  test.each(["A B", "A;touch x", "1A", "A-B", "$(id)", ""])(
    "runtime name %j that is not a shell identifier is rejected",
    (key) => {
      expect(() => tunnelPrologue([key], [key])).toThrow(
        "Invalid variable name",
      );
    },
  );

  test("declarations using the reserved prefix are rejected", () => {
    expect(() => tunnelPrologue(["FORGE_USER_VAR_X"], [])).toThrow(
      "Reserved tunnel prefix",
    );
  });
});
