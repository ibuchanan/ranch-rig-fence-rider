import { expect, test } from "bun:test";
import fc from "fast-check";
import { isLocalControl, isOptionValue } from "../../src/policy";

test("option values are non-empty and cannot parse as an option", () => {
  for (const value of ["development", "a", "dev.env", "x-y", "dev env"])
    expect(isOptionValue(value)).toBe(true);
  for (const value of ["", "-dev", "--site", "-"])
    expect(isOptionValue(value)).toBe(false);
});

test("any value with a leading dash is rejected", () => {
  fc.assert(fc.property(fc.string(), (rest) => !isOptionValue(`-${rest}`)));
});

test("local controls are exactly the environment, site and product selectors", () => {
  for (const key of ["FORGE_ENVIRONMENT", "FORGE_SITE", "FORGE_PRODUCT"])
    expect(isLocalControl(key)).toBe(true);
  for (const key of ["FORGE_TOKEN", "forge_site", "SITE"])
    expect(isLocalControl(key)).toBe(false);
});
