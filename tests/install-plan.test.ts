import { describe, expect, test } from "bun:test";
import {
  type InstallCommand,
  parseInstallOptions,
  planInstall,
} from "../src/install-plan.ts";

const values = {
  FORGE_SITE: "synthetic.atlassian.net",
  FORGE_PRODUCT: "jira",
};

function plan(
  command: InstallCommand,
  args: readonly string[],
  overrides: {
    values?: Record<string, string>;
    environment?: string | undefined;
  } = {},
) {
  const { forwarded } = parseInstallOptions([...args]);
  return planInstall({
    command,
    values: overrides.values ?? values,
    environment: "environment" in overrides ? overrides.environment : "staging",
    forwarded,
  });
}

describe.each(["install", "uninstall"] as const)("%s", (command) => {
  test("resolved values supply the target and environment defaults to development", () => {
    expect(plan(command, [])).toEqual([
      command,
      "--environment",
      "staging",
      "--site",
      "synthetic.atlassian.net",
      "--product",
      "jira",
    ]);
    expect(plan(command, [], { environment: undefined }).slice(1, 3)).toEqual([
      "--environment",
      "development",
    ]);
  });

  test.each([
    { args: ["--site", "x"] },
    { args: ["--site=x"] },
    { args: ["-sx"] },
    { args: ["-s", "x"] },
    { args: ["-p", "confluence"] },
    { args: ["--product=compass"] },
    { args: ["-e", "production", "--verbose"] },
    { args: ["--environment=release_42"] },
    { args: ["--verbose", "-eproduction"] },
  ])("target option $args is refused rather than forwarded", ({ args }) => {
    expect(() => parseInstallOptions([...args])).toThrow(
      "Target options are not accepted",
    );
  });

  test.each([
    { args: ["-upconfluence"] },
    { args: ["--upgrade"] },
    {
      args: [
        "-uall",
        "--license=active",
        "--license-modes",
        "user-access",
        "--non-interactive",
      ],
    },
    {
      args: [
        "--installation-id=--site",
        "-i--environment",
        "--app-id-override=--product",
      ],
    },
    {
      args: [
        "--license",
        "active",
        "--app-id-override=--site",
        "-ltrial",
        "--upgrade=all",
        "--",
        "--site",
        "payload",
        "-p",
        "confluence",
        "--help",
      ],
    },
  ])(
    "target-like and policy options $args are forwarded untouched",
    ({ args }) => {
      expect(plan(command, args).slice(7)).toEqual([...args]);
    },
  );

  test.each([
    { args: ["--site"] },
    { args: ["-p"] },
    { args: ["--environment="] },
    { args: ["--site="] },
    { args: ["-p", ""] },
    { args: ["--site", ""] },
    { args: ["--site", "--non-interactive"] },
    { args: ["-s=synthetic.atlassian.net"] },
    { args: ["-e=production"] },
    { args: ["--site", "one.atlassian.net", "-stwo.atlassian.net"] },
    { args: ["-pjira", "--product=jira"] },
    { args: ["-eproduction", "--environment", "staging"] },
  ])("malformed or duplicate target option $args is rejected", ({ args }) => {
    expect(() => parseInstallOptions([...args])).toThrow();
  });

  test.each(["FORGE_SITE", "FORGE_PRODUCT"])(
    "absent effective %s is rejected",
    (missing) => {
      const { [missing]: _omitted, ...rest } = values as Record<string, string>;
      expect(() => plan(command, [], { values: rest })).toThrow(
        "installation target",
      );
    },
  );
});
