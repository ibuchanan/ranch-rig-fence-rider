import { describe, expect, test } from "bun:test";
import { parseTunnelOptions, tunnelPrologue } from "../../src/tunnel-plan.ts";

describe("arguments", () => {
  test.each([
    { args: [], forwarded: [], target: undefined },
    {
      args: ["--environment", "development"],
      forwarded: [],
      target: "development",
    },
    { args: ["-e", "development"], forwarded: [], target: "development" },
    { args: ["--environment=alice-dev"], forwarded: [], target: "alice-dev" },
    { args: ["-edevelopment"], forwarded: [], target: "development" },
    {
      args: ["-dnealice-dev", "-findex.run"],
      forwarded: ["-dnealice-dev", "-findex.run"],
    },
    {
      args: ["--debugHost", "--environment", "development"],
      forwarded: ["--debugHost"],
      target: "development",
    },
    {
      args: ["--debugStartingPort=--environment", "-edevelopment"],
      forwarded: ["--debugStartingPort=--environment"],
      target: "development",
    },
    {
      args: ["-edevelopment", "--", "--help", "-eproduction"],
      forwarded: ["--", "--help", "-eproduction"],
      target: "development",
    },
  ])("verified grammar $args", ({ args, forwarded, target }) => {
    expect(parseTunnelOptions([...args])).toEqual({
      target,
      forwarded: [...forwarded],
      help: false,
    });
  });

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
