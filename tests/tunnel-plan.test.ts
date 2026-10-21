import { describe, expect, test } from "bun:test";
import { parseTunnelOptions, tunnelPrologue } from "../src/tunnel-plan.ts";

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

const spawn = (script: string, env: Record<string, string>) =>
  Bun.spawnSync(["/bin/sh", "-c", script], {
    env: { PATH: "/usr/bin:/bin", ...env },
  });

describe("prologue", () => {
  /** What Forge would see: the prefixed variables left after running the prologue. */
  const prefixed = (
    declared: string[],
    runtime: string[],
    env: Record<string, string>,
  ) =>
    Object.fromEntries(
      spawn(`${tunnelPrologue(declared, runtime)}env -0`, env)
        .stdout.toString()
        .split("\0")
        .filter((line) => line.startsWith("FORGE_USER_VAR_"))
        .map((line) => [
          line.slice(0, line.indexOf("=")),
          line.slice(line.indexOf("=") + 1),
        ]),
    );

  test("maps only runtime members and skips unset ones", () => {
    expect(
      prefixed(["SHARED", "LOCAL_ONLY", "OPTIONAL"], ["SHARED", "OPTIONAL"], {
        SHARED: "s",
        LOCAL_ONLY: "l",
      }),
    ).toEqual({ FORGE_USER_VAR_SHARED: "s" });
  });

  test.each(["", "--option-like", "0", "false", "two\nlines", "$(id) 'q'"])(
    "keeps the string %j exactly, including the empty one",
    (value) => {
      expect(prefixed(["OPTIONAL"], ["OPTIONAL"], { OPTIONAL: value })).toEqual(
        { FORGE_USER_VAR_OPTIONAL: value },
      );
    },
  );

  test("removes ambient prefixed variables, whether declared, runtime or unknown", () => {
    expect(
      prefixed(["SHARED", "LOCAL_ONLY"], ["SHARED"], {
        SHARED: "s",
        FORGE_USER_VAR_SHARED: "stale",
        FORGE_USER_VAR_LOCAL_ONLY: "unauthorized",
        FORGE_USER_VAR_UNDECLARED: "ambient",
      }),
    ).toEqual({ FORGE_USER_VAR_SHARED: "s" });
  });

  test("a runtime-free scope still removes ambient prefixed variables", () => {
    expect(prefixed([], [], { FORGE_USER_VAR_UNDECLARED: "ambient" })).toEqual(
      {},
    );
  });

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
