import { describe, expect, test } from "bun:test";
import { parseInstallOptions } from "../src/install-plan.ts";

describe("install and uninstall options", () => {
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
      expect(parseInstallOptions([...args]).forwarded).toEqual([...args]);
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
});
