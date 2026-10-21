import { expect, test } from "bun:test";
import { secretSpecVersion, versionBanner } from "../src/secretspec";

test("the supported version is 0.21.1 and its banner matches the executable's output", () => {
  expect(secretSpecVersion).toBe("0.21.1");
  expect(versionBanner).toBe("secretspec 0.21.1");
});
