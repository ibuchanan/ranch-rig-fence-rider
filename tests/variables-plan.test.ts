import { describe, expect, test } from "bun:test";
import { parseTargetOptions } from "../src/target.ts";
import { planUploads } from "../src/variables-plan.ts";

describe("target option", () => {
  test.each([
    { args: [], target: undefined },
    { args: ["--environment", "production"], target: "production" },
    { args: ["-e", "release_42"], target: "release_42" },
    { args: ["--environment=release_42"], target: "release_42" },
    { args: ["-erelease_42"], target: "release_42" },
  ])("$args selects $target", ({ args, target }) => {
    expect(parseTargetOptions([...args])).toEqual({
      explicitTarget: target,
      forwarded: [],
      help: false,
    });
  });

  test.each([
    { args: ["--environment"] },
    { args: ["-e"] },
    { args: ["--environment="] },
    { args: ["--environment", ""] },
    { args: ["--environment", "--non-interactive"] },
    { args: ["-e", "--"] },
    { args: ["-e=production"] },
    { args: ["-e", "production", "--environment=staging"] },
    { args: ["--environment=production", "-eproduction"] },
  ])("invalid or duplicate target %j is rejected", ({ args }) => {
    expect(() => parseTargetOptions([...args])).toThrow();
  });

  test.each([
    { args: ["--", "--environment", "production", "-e", "other"] },
    { args: ["--tag=--environment=production", "--non-interactive"] },
    { args: ["-t--environment=production", "-v3"] },
  ])("target-like payloads %j are forwarded untouched", ({ args }) => {
    expect(parseTargetOptions([...args])).toMatchObject({
      explicitTarget: undefined,
      forwarded: args,
    });
  });

  test("an explicit target is consumed before the terminator", () => {
    expect(
      parseTargetOptions(["-v", "--environment=production", "--", "-e", "x"]),
    ).toEqual({
      explicitTarget: "production",
      forwarded: ["-v", "--", "-e", "x"],
      help: false,
    });
  });

  test.each([["--help"], ["-h"]])("%s requests help", (flag) => {
    expect(parseTargetOptions([flag as string]).help).toBe(true);
  });
});

describe("encrypted uploads", () => {
  const plan = (runtime: string[], values: Record<string, string>) =>
    planUploads({ target: "staging", runtime, values });

  test("each present runtime value gets one encrypted upload to the target, in declaration order", () => {
    expect(plan(["B", "A"], { A: "synthetic-a", B: "synthetic-b" })).toEqual([
      {
        key: "B",
        args: [
          "variables",
          "set",
          "--encrypt",
          "--environment",
          "staging",
          "B",
          "synthetic-b",
        ],
      },
      {
        key: "A",
        args: [
          "variables",
          "set",
          "--encrypt",
          "--environment",
          "staging",
          "A",
          "synthetic-a",
        ],
      },
    ]);
  });

  test("absent optional values are skipped", () => {
    expect(plan(["OPTIONAL"], {})).toEqual([]);
  });

  test.each(["FORGE_ENVIRONMENT", "FORGE_SITE", "FORGE_PRODUCT"])(
    "local control %s cannot be uploaded",
    (key) => {
      expect(() => plan([key], { [key]: "x" })).toThrow("Local control");
    },
  );

  test.each(["", "-leading-dash"])(
    "unsupported upload value %j is rejected",
    (value) => {
      expect(() => plan(["SHARED"], { SHARED: value })).toThrow(
        "Unsupported Forge positional value",
      );
    },
  );
});
