import { expect, test } from "bun:test";
import { isEnvironmentName, isLocalControl } from "../src/policy";

test("environment names start alphanumeric and continue with letters, digits, underscore or dash", () => {
  for (const name of ["development", "staging", "a", "dev_1-x", "9lives"])
    expect(isEnvironmentName(name)).toBe(true);
  for (const name of ["", "-dev", "_dev", "dev env", "dev/x", "dev\n"])
    expect(isEnvironmentName(name)).toBe(false);
});

test("local controls are exactly the environment, site and product selectors", () => {
  for (const key of [
    "FORGE_ENVIRONMENT",
    "FORGE_ENV",
    "FORGE_SITE",
    "FORGE_PRODUCT",
  ])
    expect(isLocalControl(key)).toBe(true);
  for (const key of ["FORGE_TOKEN", "forge_site", "SITE"])
    expect(isLocalControl(key)).toBe(false);
});
