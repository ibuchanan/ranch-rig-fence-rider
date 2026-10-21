import { describe, expect, test } from "bun:test";
import { parseInstallOptions } from "../src/install-plan.ts";

describe("install and uninstall options", () => {
  test.each([
    { args: ["--site", "x"], forwarded: [], ignored: ["site"] },
    { args: ["--site=x"], forwarded: [], ignored: ["site"] },
    { args: ["-sx"], forwarded: [], ignored: ["site"] },
    { args: ["-s", "x"], forwarded: [], ignored: ["site"] },
    { args: ["-p", "confluence"], forwarded: [], ignored: ["product"] },
    { args: ["--product=compass"], forwarded: [], ignored: ["product"] },
    {
      args: ["-e", "production", "--verbose"],
      forwarded: ["--verbose"],
      ignored: ["environment"],
    },
    {
      args: ["--environment=release_42"],
      forwarded: [],
      ignored: ["environment"],
    },
    {
      args: ["--verbose", "-eproduction"],
      forwarded: ["--verbose"],
      ignored: ["environment"],
    },
    {
      args: ["-sx", "--upgrade", "-pjira", "-e", "dev", "--verbose"],
      forwarded: ["--upgrade", "--verbose"],
      ignored: ["site", "product", "environment"],
    },
  ])(
    "target option $args is dropped with its value, not forwarded",
    ({ args, forwarded, ignored }) => {
      const parsed = parseInstallOptions([...args]);
      expect(parsed.forwarded).toEqual([...forwarded]);
      expect(parsed.ignored).toEqual([...ignored]);
    },
  );

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
    { args: ["--site"], forwarded: [], ignored: ["site"] },
    { args: ["-p"], forwarded: [], ignored: ["product"] },
    { args: ["--environment="], forwarded: [], ignored: ["environment"] },
    { args: ["--site="], forwarded: [], ignored: ["site"] },
    { args: ["-p", ""], forwarded: [], ignored: ["product"] },
    { args: ["--site", ""], forwarded: [], ignored: ["site"] },
    // A dropped option takes the next argument as its value, as Forge's would.
    {
      args: ["--site", "--non-interactive"],
      forwarded: [],
      ignored: ["site"],
    },
  ])(
    "empty or missing value $args is dropped like any target option",
    ({ args, forwarded, ignored }) => {
      const parsed = parseInstallOptions([...args]);
      expect(parsed.forwarded).toEqual([...forwarded]);
      expect(parsed.ignored).toEqual([...ignored]);
    },
  );

  test.each([
    { args: ["-s=synthetic.atlassian.net"] },
    { args: ["-e=production"] },
    { args: ["--site", "one.atlassian.net", "-stwo.atlassian.net"] },
    { args: ["-pjira", "--product=jira"] },
    { args: ["-eproduction", "--environment", "staging"] },
  ])("duplicate or malformed target option $args is rejected", ({ args }) => {
    expect(() => parseInstallOptions([...args])).toThrow();
  });
});
