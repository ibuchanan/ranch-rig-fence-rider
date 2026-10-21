import { describe, expect, test } from "bun:test";
import {
  parseTunnelOptions,
  tunnelArgs,
  tunnelRuntimeVariables,
  tunnelTarget,
} from "../src/tunnel-plan.ts";

function plan(args: readonly string[], configured?: string) {
  const { target, forwarded } = parseTunnelOptions([...args]);
  return tunnelArgs(tunnelTarget(target, configured), forwarded);
}

describe("arguments", () => {
  test.each([
    { args: ["--environment", "development"], forwarded: [] },
    { args: ["-e", "development"], forwarded: [] },
    { args: ["--environment=alice-dev"], forwarded: [], target: "alice-dev" },
    { args: ["-edevelopment"], forwarded: [] },
    {
      args: ["-dnealice-dev", "-findex.run"],
      forwarded: ["-dnealice-dev", "-findex.run"],
    },
    {
      args: ["--debugHost", "--environment", "development"],
      forwarded: ["--debugHost"],
    },
    {
      args: ["--debugStartingPort=--environment", "-edevelopment"],
      forwarded: ["--debugStartingPort=--environment"],
    },
    {
      args: ["-edevelopment", "--", "--help", "-eproduction"],
      forwarded: ["--", "--help", "-eproduction"],
    },
  ])(
    "verified grammar $args",
    ({ args, forwarded, target = "development" }) => {
      expect(plan(args)).toEqual([
        "tunnel",
        "--environment",
        target,
        ...forwarded,
      ]);
    },
  );

  test("-h is a Forge option, not wrapper help", () => {
    expect(parseTunnelOptions(["-h"])).toMatchObject({
      help: false,
      forwarded: ["-h"],
    });
    expect(parseTunnelOptions(["--help"]).help).toBe(true);
  });

  test.each([
    { args: ["--environment"] },
    { args: ["-e"] },
    { args: ["--environment="] },
    { args: ["-e=development"] },
    { args: ["-e", ""] },
    { args: ["-e", "--verbose"] },
    { args: ["-edevelopment", "--environment", "development"] },
  ])("invalid or duplicate target $args is rejected", ({ args }) => {
    expect(() => parseTunnelOptions([...args])).toThrow();
  });
});

describe("target", () => {
  test("explicit, then configured, then development", () => {
    expect(tunnelTarget("a", "b")).toBe("a");
    expect(tunnelTarget(undefined, "b")).toBe("b");
    expect(tunnelTarget(undefined, undefined)).toBe("development");
  });

  test("an empty configured target is rejected", () => {
    expect(() => tunnelTarget(undefined, "")).toThrow(
      "Invalid tunnel environment",
    );
  });
});

describe("runtime variables", () => {
  test("maps only runtime members and skips absent values", () => {
    expect(
      tunnelRuntimeVariables(
        ["SHARED", "LOCAL_ONLY", "OPTIONAL"],
        ["SHARED", "OPTIONAL"],
        { SHARED: "s", LOCAL_ONLY: "l" },
      ),
    ).toEqual({ FORGE_USER_VAR_SHARED: "s" });
  });

  test.each(["", "--option-like", "0", "false"])(
    "keeps destination-supported string %j",
    (value) => {
      expect(
        tunnelRuntimeVariables(["OPTIONAL"], ["OPTIONAL"], { OPTIONAL: value }),
      ).toEqual({ FORGE_USER_VAR_OPTIONAL: value });
    },
  );

  test.each(["FORGE_ENVIRONMENT", "FORGE_ENV", "FORGE_SITE", "FORGE_PRODUCT"])(
    "local control %s cannot be a runtime variable",
    (key) => {
      expect(() =>
        tunnelRuntimeVariables([key], [key], { [key]: "x" }),
      ).toThrow("Local control");
    },
  );

  test("declarations using the reserved prefix are rejected", () => {
    expect(() => tunnelRuntimeVariables(["FORGE_USER_VAR_X"], [], {})).toThrow(
      "Reserved tunnel prefix",
    );
  });
});
