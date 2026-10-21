import { describe, expect, test } from "bun:test";
import { parseDeployOptions, planDeploy } from "../src/deploy-plan.ts";

const values = { SHARED: "synthetic-value" };

function plan(args: readonly string[], environment?: string) {
  const { explicitTarget, forwarded } = parseDeployOptions([...args]);
  return planDeploy({
    explicitTarget,
    environment,
    runtime: ["SHARED"],
    values,
    forwarded,
  });
}

describe("target selection", () => {
  test.each([
    { args: [], environment: "staging", target: "staging" },
    { args: [], environment: undefined, target: "development" },
    {
      args: ["--environment", "production"],
      environment: "staging",
      target: "production",
    },
    {
      args: ["-e", "release_42"],
      environment: undefined,
      target: "release_42",
    },
    {
      args: ["--environment=release_42"],
      environment: undefined,
      target: "release_42",
    },
    { args: ["-erelease_42"], environment: undefined, target: "release_42" },
  ])(
    "$args with environment $environment selects $target",
    ({ args, environment, target }) => {
      const result = plan(args, environment);
      expect(result.target).toBe(target);
      expect(result.uploads[0]?.args).toContain(target);
      expect(result.deployArgs.slice(0, 3)).toEqual([
        "deploy",
        "--environment",
        target,
      ]);
    },
  );

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
    expect(() => parseDeployOptions([...args])).toThrow();
  });
});

describe("forwarded Forge arguments", () => {
  test.each([
    { args: ["--", "--environment", "production", "-e", "other"] },
    {
      args: [
        "--tag=--environment=production",
        "--major-version",
        "3",
        "--non-interactive",
      ],
    },
    { args: ["-t--environment=production", "-v3", "--non-interactive"] },
  ])(
    "target-like payloads %j stay untouched after the injected target",
    ({ args }) => {
      expect(plan(args, "staging").deployArgs).toEqual([
        "deploy",
        "--environment",
        "staging",
        ...args,
      ]);
    },
  );

  test("an explicit target is consumed before the terminator", () => {
    expect(
      plan([
        "--non-interactive",
        "--environment=production",
        "--",
        "--environment",
        "payload",
      ]).deployArgs,
    ).toEqual([
      "deploy",
      "--environment",
      "production",
      "--non-interactive",
      "--",
      "--environment",
      "payload",
    ]);
  });
});

describe("encrypted uploads", () => {
  test("each present runtime value gets one encrypted upload to the target", () => {
    expect(plan([], "staging").uploads).toEqual([
      {
        key: "SHARED",
        args: [
          "variables",
          "set",
          "--encrypt",
          "--environment",
          "staging",
          "SHARED",
          "synthetic-value",
        ],
      },
    ]);
  });

  test("absent optional values are skipped", () => {
    const result = planDeploy({
      explicitTarget: undefined,
      environment: "staging",
      runtime: ["OPTIONAL"],
      values: {},
      forwarded: [],
    });
    expect(result.uploads).toEqual([]);
  });

  test.each(["FORGE_ENVIRONMENT", "FORGE_ENV", "FORGE_SITE", "FORGE_PRODUCT"])(
    "local control %s cannot be uploaded",
    (key) => {
      expect(() =>
        planDeploy({
          explicitTarget: undefined,
          environment: "staging",
          runtime: [key],
          values: { [key]: "x" },
          forwarded: [],
        }),
      ).toThrow("Local control");
    },
  );

  test.each(["", "-leading-dash"])(
    "unsupported upload value %j is rejected",
    (value) => {
      expect(() =>
        planDeploy({
          explicitTarget: undefined,
          environment: "staging",
          runtime: ["SHARED"],
          values: { SHARED: value },
          forwarded: [],
        }),
      ).toThrow("Unsupported Forge positional value");
    },
  );
});
