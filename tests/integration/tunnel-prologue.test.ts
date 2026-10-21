import { describe, expect, test } from "bun:test";
import { tunnelPrologue } from "../../src/tunnel-plan.ts";

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
});
