import { expect, test } from "bun:test";
import { useBuiltCli } from "./support/cli.ts";
import {
  installationSpec,
  installationValues,
  runInstallation,
} from "./support/fixtures.ts";

useBuiltCli();

test.each([2, 23, 127, 255])(
  "configured uninstall preserves numeric status %i with uninstall-specific diagnostics",
  async (exitCode) => {
    const result = await runInstallation({
      command: "uninstall",
      failStage: "uninstall",
      exitCode,
    });
    expect(result.exitCode).toBe(exitCode);
    expect(result.stderr).toContain(
      `uninstallation failed: exit status ${exitCode}`,
    );
    expect(result.stdout).toContain("synthetic uninstall result");
    expect(
      result.interactions
        .filter(({ tool }) => tool === "forge")
        .map(({ args }) => args[0]),
    ).toEqual(["uninstall"]);
  },
);

test.each(
  [
    ["--site", "other.atlassian.net"],
    ["--site=other.atlassian.net"],
    ["-sother.atlassian.net"],
    ["-p", "confluence"],
    ["-e", "production"],
    ["--verbose", "--environment=production"],
  ].map((args) => ({ args })),
)(
  "configured uninstall refuses target options %j before any tool",
  async ({ args }) => {
    const result = await runInstallation({ command: "uninstall", args });
    expect(result.exitCode).toBe(1);
    expect(result.interactions).toEqual([]);
    expect(result.stderr).toContain(
      "uninstallation option validation (target options are not accepted",
    );
  },
);

test.each(["FORGE_SITE", "FORGE_PRODUCT"])(
  "configured uninstall rejects absent effective %s without prompting",
  async (missing) => {
    const values: Record<string, string> = { ...installationValues };
    delete values[missing];
    const result = await runInstallation({ command: "uninstall", values });
    expect(result.exitCode).toBe(1);
    expect(result.interactions.filter(({ tool }) => tool === "forge")).toEqual(
      [],
    );
    expect(result.stderr).toContain("uninstallation target validation");
  },
);

test.each([
  { failStage: "schema" },
  { failStage: "export" },
  { launchTool: "secretspec" },
  { launchTool: "forge" },
  { missingTool: "secretspec" },
  { missingTool: "forge" },
  { failStage: "uninstall", failureMode: "signal" as const },
])(
  "configured uninstall fails safely without follow-up commands %j",
  async (options) => {
    const result = await runInstallation({ ...options, command: "uninstall" });
    expect(result.exitCode).toBe(1);
    expect(
      result.interactions
        .filter(({ tool }) => tool === "forge")
        .map(({ args }) => args[0]),
    ).toEqual(options.failStage === "uninstall" ? ["uninstall"] : []);
    expect(result.stderr).not.toContain("synthetic helper noise");
    if (options.failureMode === "signal")
      expect(result.stderr).toContain("terminated by SIGTERM");
  },
);

test("configured uninstall ignores deployment-only checks and needs no manifest even with runtime members", async () => {
  const result = await runInstallation({
    command: "uninstall",
    manifest: null,
    spec: `${installationSpec.replace('["SHARED", "OPTIONAL"]', '["FORGE_SITE", "SHARED"]')}\n[scopes.manifest]\nsecrets = ["SHARED", "OPTIONAL"]\n`,
    values: { ...installationValues, OPTIONAL: "--local-only" },
  });
  expect(result.exitCode).toBe(0);
  expect(
    result.interactions
      .filter(({ tool }) => tool === "forge")
      .map(({ args }) => args[0]),
  ).toEqual(["uninstall"]);
});

test("configured uninstall resolves once and delegates only uninstall with full local values and target defaults", async () => {
  const result = await runInstallation({
    command: "uninstall",
    env: { OPTIONAL: "stale" },
  });
  expect(result.exitCode).toBe(0);
  expect(result.interactions.filter(({ tool }) => tool === "forge")).toEqual([
    {
      tool: "forge",
      args: [
        "uninstall",
        "--environment",
        "staging",
        "--site",
        "synthetic.atlassian.net",
        "--product",
        "jira",
      ],
      values: installationValues,
    },
  ]);
  expect(
    result.interactions
      .filter(({ tool }) => tool === "secretspec")
      .map(({ args }) => args[0]),
  ).toEqual(["schema", "export"]);
});
