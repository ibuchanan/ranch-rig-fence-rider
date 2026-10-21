import { expect, test } from "bun:test";
import { useBuiltCli } from "./support/cli.ts";
import {
  installationSpec,
  installationValues,
  runInstallation,
} from "./support/fixtures.ts";

useBuiltCli();

test("configured installation resolves once and delegates only install with full local values and target defaults", async () => {
  const result = await runInstallation({ env: { OPTIONAL: "stale" } });
  expect(result.exitCode).toBe(0);
  expect(result.interactions.filter(({ tool }) => tool === "forge")).toEqual([
    {
      tool: "forge",
      args: [
        "install",
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
  expect(result.stdout).toContain("synthetic install result");
  expect(result.stderr).toBe("synthetic install warning\n");
});

test("configured installation overrides targets independently and preserves explicit upgrade policy", async () => {
  const result = await runInstallation({
    args: [
      "--verbose",
      "-sother.atlassian.net",
      "--upgrade",
      "code",
      "--confirm-scopes",
      "--non-interactive",
    ],
  });
  expect(result.exitCode).toBe(0);
  expect(
    result.interactions
      .filter(({ tool }) => tool === "forge")
      .map(({ args }) => args),
  ).toEqual([
    [
      "install",
      "--environment",
      "staging",
      "--site",
      "other.atlassian.net",
      "--product",
      "jira",
      "--verbose",
      "--upgrade",
      "code",
      "--confirm-scopes",
      "--non-interactive",
    ],
  ]);
});

test.each([
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
  "configured installation preserves target-like option payloads and terminators %j",
  async ({ args }) => {
    const result = await runInstallation({ args });
    expect(result.exitCode).toBe(0);
    expect(
      result.interactions
        .filter(({ tool }) => tool === "forge")
        .map(({ args }) => args),
    ).toEqual([
      [
        "install",
        "--environment",
        "staging",
        "--site",
        "synthetic.atlassian.net",
        "--product",
        "jira",
        ...args,
      ],
    ]);
  },
);

test.each(
  [
    ["--site"],
    ["-s=synthetic.atlassian.net"],
    ["-p"],
    ["--environment="],
    ["--site", ""],
    ["--site", "--non-interactive"],
    ["-p=jira"],
    ["--site", "one.atlassian.net", "-stwo.atlassian.net"],
    ["-pjira", "--product=jira"],
    ["-eproduction", "--environment", "staging"],
  ].map((args) => ({ args })),
)(
  "configured installation rejects invalid or duplicate explicit targets %j before tools",
  async ({ args }) => {
    const result = await runInstallation({ args });
    expect(result.exitCode).toBe(1);
    expect(result.interactions).toEqual([]);
    expect(result.stderr).toContain("installation option validation");
  },
);

test.each(["FORGE_SITE", "FORGE_PRODUCT"])(
  "configured installation rejects absent effective %s without prompting",
  async (missing) => {
    const values: Record<string, string> = { ...installationValues };
    delete values[missing];
    const result = await runInstallation({ values });
    expect(result.exitCode).toBe(1);
    expect(result.interactions.filter(({ tool }) => tool === "forge")).toEqual(
      [],
    );
    expect(result.stderr).toContain("installation target validation");
  },
);

test.each([
  {
    args: ["-upconfluence"],
    target: ["staging", "synthetic.atlassian.net", "jira"],
    forwarded: ["-upconfluence"],
  },
  {
    args: ["-e", "production"],
    target: ["production", "synthetic.atlassian.net", "jira"],
  },
  {
    args: [
      "--environment=production",
      "--site=https://other.atlassian.net",
      "--product=confluence",
    ],
    target: ["production", "https://other.atlassian.net", "confluence"],
  },
  {
    args: ["-eproduction", "-shttps://bitbucket.org/synthetic/", "-pbitbucket"],
    target: ["production", "https://bitbucket.org/synthetic/", "bitbucket"],
  },
  {
    args: ["-p", "compass"],
    target: ["staging", "synthetic.atlassian.net", "compass"],
  },
  {
    args: ["--upgrade"],
    target: ["staging", "synthetic.atlassian.net", "jira"],
    forwarded: ["--upgrade"],
  },
  {
    args: [
      "-uall",
      "--license=active",
      "--license-modes",
      "user-access",
      "--users-with-access",
      "one",
      "two",
      "--non-interactive",
    ],
    target: ["staging", "synthetic.atlassian.net", "jira"],
    forwarded: [
      "-uall",
      "--license=active",
      "--license-modes",
      "user-access",
      "--users-with-access",
      "one",
      "two",
      "--non-interactive",
    ],
  },
])(
  "configured installation supports verified target and policy forms %j",
  async ({ args, target, forwarded = [] }) => {
    const result = await runInstallation({ args });
    expect(result.exitCode).toBe(0);
    expect(
      result.interactions
        .filter(({ tool }) => tool === "forge")
        .map(({ args }) => args),
    ).toEqual([
      [
        "install",
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

test.each([2, 23, 127, 255])(
  "configured installation preserves Forge status %i",
  async (exitCode) => {
    const result = await runInstallation({ failStage: "install", exitCode });
    expect(result.exitCode).toBe(exitCode);
    expect(result.stdout).toContain("synthetic install result");
    expect(result.stderr).toContain(
      `installation failed: exit status ${exitCode}`,
    );
    expect(result.interactions.at(-1)?.args[0]).toBe("install");
  },
);

test.each([
  { failStage: "schema" },
  { failStage: "export" },
  { launchTool: "secretspec" },
  { launchTool: "forge" },
  { missingTool: "secretspec" },
  { missingTool: "forge" },
  { failStage: "install", failureMode: "signal" as const },
])(
  "configured installation fails safely without follow-up commands %j",
  async (options) => {
    const result = await runInstallation(options);
    expect(result.exitCode).toBe(1);
    expect(
      result.interactions.filter(({ tool }) => tool === "forge").length,
    ).toBe(options.failStage === "install" ? 1 : 0);
    expect(result.stderr).not.toContain("synthetic helper noise");
  },
);

test("configured installation ignores deployment-only scope checks and needs no manifest", async () => {
  const result = await runInstallation({
    manifest: null,
    spec: `${installationSpec.replace('["SHARED", "OPTIONAL"]', '["FORGE_SITE", "SHARED"]')}\n[scopes.manifest]\nsecrets = ["SHARED", "OPTIONAL"]\n`,
    values: { ...installationValues, OPTIONAL: "--local-only" },
  });
  expect(result.exitCode).toBe(0);
  expect(
    result.interactions
      .filter(({ tool }) => tool === "forge")
      .map(({ args }) => args[0]),
  ).toEqual(["install"]);
});
