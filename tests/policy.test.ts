import { expect, test } from "bun:test";
import fc from "fast-check";
import { isEnvironmentName, isLocalControl } from "../src/policy";

test("environment names start alphanumeric and continue with letters, digits, underscore or dash", () => {
  for (const name of ["development", "staging", "a", "dev_1-x", "9lives"])
    expect(isEnvironmentName(name)).toBe(true);
  for (const name of ["", "-dev", "_dev", "dev env", "dev/x", "dev\n"])
    expect(isEnvironmentName(name)).toBe(false);
});

test("generated names in the allowed alphabet are accepted", () => {
  fc.assert(
    fc.property(fc.stringMatching(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,30}$/), (name) =>
      isEnvironmentName(name),
    ),
  );
});

test("a name is rejected once any disallowed character is inserted anywhere", () => {
  fc.assert(
    fc.property(
      fc.stringMatching(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,30}$/),
      fc.constantFrom(" ", "/", ".", "\n", "\r", "\t", "$", "@", "é", "\0"),
      fc.nat(),
      (name, bad, at) => {
        const index = at % (name.length + 1);
        const mutated = name.slice(0, index) + bad + name.slice(index);
        return !isEnvironmentName(mutated);
      },
    ),
  );
});

test("a leading dash or underscore is always rejected", () => {
  fc.assert(
    fc.property(
      fc.constantFrom("-", "_"),
      fc.stringMatching(/^[a-zA-Z0-9_-]{0,20}$/),
      (lead, rest) => !isEnvironmentName(lead + rest),
    ),
  );
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
