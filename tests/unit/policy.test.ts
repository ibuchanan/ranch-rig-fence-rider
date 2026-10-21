import { expect, test } from "bun:test";
import fc from "fast-check";
import { isLocalControl, isOptionValue } from "../../src/policy";

test.each(["development", "a", "dev.env", "x-y", "dev env"])(
  "%j is an option value",
  (value) => {
    expect(isOptionValue(value)).toBe(true);
  },
);

test.each(["", "-dev", "--site", "-"])("%j is not an option value", (value) => {
  expect(isOptionValue(value)).toBe(false);
});

test("any value with a leading dash is rejected", () => {
  fc.assert(fc.property(fc.string(), (rest) => !isOptionValue(`-${rest}`)));
});

test.each(["FORGE_ENVIRONMENT", "FORGE_SITE", "FORGE_PRODUCT"])(
  "%s is a local control",
  (key) => {
    expect(isLocalControl(key)).toBe(true);
  },
);

test.each(["FORGE_TOKEN", "forge_site", "SITE"])(
  "%s is not a local control",
  (key) => {
    expect(isLocalControl(key)).toBe(false);
  },
);
