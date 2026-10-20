import { expect, test } from "bun:test";
import {
  locateSecretSpec,
  secretSpecVersion,
  versionBanner,
} from "../src/secretspec";

test("the pinned version is 0.21.1 and its banner matches the executable's output", () => {
  expect(secretSpecVersion).toBe("0.21.1");
  expect(versionBanner).toBe("secretspec 0.21.1");
});

test("a compiled build uses PATH and skips version verification", () => {
  expect(locateSecretSpec({ compiled: true, sourceDir: "/pkg/src" })).toEqual({
    path: undefined,
    verifyVersion: false,
  });
});

test("an installed package uses its package-local executable and verifies it", () => {
  expect(locateSecretSpec({ compiled: false, sourceDir: "/pkg/src" })).toEqual({
    path: "/pkg/.tools/secretspec",
    verifyVersion: true,
  });
});
