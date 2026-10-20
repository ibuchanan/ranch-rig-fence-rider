import { expect, test } from "bun:test";
import { useBuiltCli } from "./support/cli.ts";
import {
  installationSpec,
  installationValues,
  runInstallation,
} from "./support/fixtures.ts";

useBuiltCli();

test("configured uninstall preserves installation-id payloads rather than consuming target-like values", async () => {
  const args = [
    "--verbose",
    "--installation-id",
    "--site",
    "-i",
    "--environment",
    "--app-id-override",
    "--product",
    "--",
    "--site",
    "payload",
    "--help",
  ];
  const result = await runInstallation({ command: "uninstall", args });
  expect(result.exitCode).toBe(0);
  expect(
    result.interactions
      .filter(({ tool }) => tool === "forge")
      .map(({ args }) => args),
  ).toEqual([
    [
      "uninstall",
      "--environment",
      "staging",
      "--site",
      "synthetic.atlassian.net",
      "--product",
      "jira",
      ...args,
    ],
  ]);
});

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

test.each([
  {
    args: ["-e", "production", "--verbose"],
    target: ["production", "synthetic.atlassian.net", "jira"],
    forwarded: ["--verbose"],
  },
  {
    args: ["--site", "other.atlassian.net"],
    target: ["staging", "other.atlassian.net", "jira"],
  },
  {
    args: ["-p", "confluence"],
    target: ["staging", "synthetic.atlassian.net", "confluence"],
  },
  {
    args: [
      "--environment=release_42",
      "--site=https://other.atlassian.net",
      "--product=compass",
    ],
    target: ["release_42", "https://other.atlassian.net", "compass"],
  },
  {
    args: [
      "-eproduction",
      "-shttps://bitbucket.org/synthetic/",
      "-pbitbucket",
      "--batch",
    ],
    target: ["production", "https://bitbucket.org/synthetic/", "bitbucket"],
    forwarded: ["--batch"],
  },
  {
    args: [
      "--installation-id=--site",
      "-i--environment",
      "--app-id-override=--product",
      "--verbose",
    ],
    target: ["staging", "synthetic.atlassian.net", "jira"],
    forwarded: [
      "--installation-id=--site",
      "-i--environment",
      "--app-id-override=--product",
      "--verbose",
    ],
  },
  {
    args: ["--installation-id", "--help", "--", "-h"],
    target: ["staging", "synthetic.atlassian.net", "jira"],
    forwarded: ["--installation-id", "--help", "--", "-h"],
  },
])(
  "configured uninstall preserves verified target and argument forms %j",
  async ({ args, target, forwarded = [] }) => {
    const result = await runInstallation({ command: "uninstall", args });
    expect(result.exitCode).toBe(0);
    expect(
      result.interactions
        .filter(({ tool }) => tool === "forge")
        .map(({ args }) => args),
    ).toEqual([
      [
        "uninstall",
        "--environment",
        target[0],
        "--site",
        target[1],
        "--product",
        target[2],
        ...forwarded,
      ],
    ]);
  },
);

test.each(
  [
    ["--site"],
    ["--product"],
    ["--environment"],
    ["--site="],
    ["-p", ""],
    ["-e=production"],
    ["-s=other.atlassian.net"],
    ["-p=jira"],
    ["--site", "--verbose"],
    ["--site", "not a site"],
    ["--site", "https://user:pass@example.atlassian.net"],
    ["--site", "file:///tmp/site"],
    ["--product", "jsm"],
    ["--environment", "bad.target"],
    ["--site", "one.atlassian.net", "-stwo.atlassian.net"],
    ["-pjira", "--product=jira"],
    ["-eproduction", "--environment", "staging"],
  ].map((args) => ({ args })),
)(
  "configured uninstall rejects invalid and duplicate targets %j before tools",
  async ({ args }) => {
    const result = await runInstallation({ command: "uninstall", args });
    expect(result.exitCode).toBe(1);
    expect(result.interactions).toEqual([]);
    expect(result.stderr).toContain("uninstallation option validation");
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
