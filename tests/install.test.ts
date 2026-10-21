import { describe, expect, test } from "bun:test";
import { useBuiltCli } from "./support/cli.ts";
import {
  installationSchema,
  installationSpec,
  installationValues,
  runInstallation,
} from "./support/fixtures.ts";

useBuiltCli();

const commands = ["install", "uninstall"] as const;
const operation = (command: (typeof commands)[number]) =>
  command === "install" ? "installation" : "uninstallation";

type Run = Awaited<ReturnType<typeof runInstallation>>;
const forgeCalls = (result: Run) =>
  result.interactions.filter(({ tool }) => tool === "forge");
const secretSpecCalls = (result: Run) =>
  result.interactions.filter(({ tool }) => tool === "secretspec");

const withoutValue = (name: string) => {
  const values: Record<string, string> = { ...installationValues };
  delete values[name];
  return values;
};

describe.each(commands)("configured %s", (command) => {
  test("runs Forge under one secretspec run with the full profile and the profile's targets", async () => {
    const result = await runInstallation({
      command,
      env: { OPTIONAL: "stale" },
    });
    expect(result.exitCode).toBe(0);
    expect(forgeCalls(result)).toEqual([
      {
        tool: "forge",
        args: [
          command,
          "--environment",
          "staging",
          "--site",
          "synthetic.atlassian.net",
          "--product",
          "jira",
        ],
        // secretspec run does not clear a stale value for an unresolved optional.
        values: { ...installationValues, OPTIONAL: "stale" },
      },
    ]);
    const [call, ...others] = secretSpecCalls(result);
    expect(others).toEqual([]);
    expect(call?.args.slice(0, 6)).toEqual([
      "run",
      "--scope",
      "",
      "--",
      "sh",
      "-c",
    ]);
    expect(call?.args.slice(7)).toEqual(["sh", command]);
    expect(result.stdout).toContain(`synthetic ${command} result`);
    expect(result.stderr).toBe(`synthetic ${command} warning\n`);
  });

  test("forwards Forge options and policy untouched after the injected targets", async () => {
    const forwarded = [
      "--verbose",
      "--upgrade",
      "code",
      "--confirm-scopes",
      "--non-interactive",
      "--",
      "--site",
      "payload",
    ];
    const result = await runInstallation({ command, args: forwarded });
    expect(result.exitCode).toBe(0);
    expect(forgeCalls(result).map(({ args }) => args)).toEqual([
      [
        command,
        "--environment",
        "staging",
        "--site",
        "synthetic.atlassian.net",
        "--product",
        "jira",
        ...forwarded,
      ],
    ]);
  });

  test("keeps shell metacharacters in forwarded arguments and values as single arguments", async () => {
    const forwarded = [
      "--note",
      "a b;$(touch injected)",
      "'quoted'",
      '"double"',
      "`touch injected`",
      "$HOME",
      "*",
    ];
    const site = "my site;$(touch injected)`touch injected`.atlassian.net";
    const result = await runInstallation({
      command,
      args: forwarded,
      values: { ...installationValues, FORGE_SITE: site },
    });
    expect(result.exitCode).toBe(0);
    expect(forgeCalls(result).map(({ args }) => args)).toEqual([
      [
        command,
        "--environment",
        "staging",
        "--site",
        site,
        "--product",
        "jira",
        ...forwarded,
      ],
    ]);
  });

  test.each(
    [
      ["--site", "other.atlassian.net"],
      ["--site=other.atlassian.net"],
      ["-sother.atlassian.net"],
      ["-p", "confluence"],
      ["-e", "production"],
      ["--verbose", "--environment=production"],
    ].map((args) => ({ args })),
  )("refuses target options $args before any tool", async ({ args }) => {
    const result = await runInstallation({ command, args });
    expect(result.exitCode).toBe(1);
    expect(result.interactions).toEqual([]);
    expect(result.stderr).toContain(
      `${operation(command)} option validation (target options are not accepted`,
    );
  });

  test.each(
    ["FORGE_ENVIRONMENT", "FORGE_SITE", "FORGE_PRODUCT"].flatMap((name) =>
      ["", "-x", "--help"].map((value) => ({ name, value })),
    ),
  )("refuses $name=$value without calling Forge", async ({ name, value }) => {
    const result = await runInstallation({
      command,
      values: { ...installationValues, [name]: value },
    });
    expect(result.exitCode).toBe(1);
    expect(forgeCalls(result)).toEqual([]);
    expect(result.stderr).toContain("target is missing or invalid");
    expect(result.stderr).toContain(`${operation(command)} failed`);
  });

  test.each(["FORGE_SITE", "FORGE_PRODUCT"])(
    "refuses a profile that does not resolve %s without prompting",
    async (missing) => {
      const result = await runInstallation({
        command,
        values: withoutValue(missing),
      });
      expect(result.exitCode).toBe(1);
      expect(forgeCalls(result)).toEqual([]);
      expect(result.stderr).toContain("target is missing or invalid");
    },
  );

  test("defaults the environment to development when the profile does not resolve it", async () => {
    const result = await runInstallation({
      command,
      schema: {
        ...installationSchema,
        required: ["SHARED", "LOCAL_ONLY"],
      },
      values: withoutValue("FORGE_ENVIRONMENT"),
    });
    expect(result.exitCode).toBe(0);
    expect(forgeCalls(result).map(({ args }) => args.slice(0, 3))).toEqual([
      [command, "--environment", "development"],
    ]);
  });

  test("leaves a missing required value to secretspec run, before Forge", async () => {
    const result = await runInstallation({
      command,
      values: withoutValue("LOCAL_ONLY"),
    });
    expect(result.exitCode).toBe(1);
    expect(forgeCalls(result)).toEqual([]);
    expect(result.stderr).toContain("LOCAL_ONLY");
    expect(result.stderr).toContain(`${operation(command)} failed`);
  });

  test("uses an exported FORGE_SITE the profile does not resolve", async () => {
    const result = await runInstallation({
      command,
      values: withoutValue("FORGE_SITE"),
      env: { FORGE_SITE: "ambient.atlassian.net" },
    });
    expect(result.exitCode).toBe(0);
    expect(forgeCalls(result).map(({ args }) => args[4])).toEqual([
      "ambient.atlassian.net",
    ]);
  });

  test("prefers the resolved FORGE_SITE over an exported one", async () => {
    const result = await runInstallation({
      command,
      env: { FORGE_SITE: "ambient.atlassian.net" },
    });
    expect(result.exitCode).toBe(0);
    expect(forgeCalls(result).map(({ args }) => args[4])).toEqual([
      "synthetic.atlassian.net",
    ]);
  });

  test.each([2, 23, 127, 255])(
    "preserves Forge status %i",
    async (exitCode) => {
      const result = await runInstallation({
        command,
        failStage: command,
        exitCode,
      });
      expect(result.exitCode).toBe(exitCode);
      expect(result.stdout).toContain(`synthetic ${command} result`);
      expect(result.stderr).toContain(
        `${operation(command)} failed: exit status ${exitCode}`,
      );
      expect(forgeCalls(result).map(({ args }) => args[0])).toEqual([command]);
    },
  );

  test("preserves the status of a failing secretspec run before Forge", async () => {
    const result = await runInstallation({
      command,
      failStage: "run",
      exitCode: 5,
    });
    expect(result.exitCode).toBe(5);
    expect(result.stderr).toContain(
      `${operation(command)} failed: exit status 5`,
    );
    expect(forgeCalls(result)).toEqual([]);
  });

  test.each([
    { launchTool: "secretspec" },
    { missingTool: "secretspec" },
    { missingTool: "forge" },
  ])("fails safely without running Forge %j", async (options) => {
    const result = await runInstallation({ ...options, command });
    expect(result.exitCode).toBe(1);
    expect(forgeCalls(result)).toEqual([]);
    expect(result.stderr).not.toContain("synthetic helper noise");
  });

  test("fails when Forge cannot be launched", async () => {
    const result = await runInstallation({ command, launchTool: "forge" });
    expect(result.exitCode).not.toBe(0);
    expect(forgeCalls(result)).toEqual([]);
    expect(result.stderr).not.toContain("synthetic helper noise");
  });

  test("reports a Forge killed by a signal", async () => {
    const result = await runInstallation({
      command,
      failStage: command,
      failureMode: "signal",
    });
    expect(result.exitCode).toBe(1);
    expect(forgeCalls(result).map(({ args }) => args[0])).toEqual([command]);
    expect(result.stderr).toContain("terminated by SIGTERM");
    expect(result.stderr).not.toContain("synthetic helper noise");
  });

  test("ignores deployment-only scope checks and needs no manifest", async () => {
    const result = await runInstallation({
      command,
      manifest: null,
      spec: `${installationSpec.replace('["SHARED", "OPTIONAL"]', '["FORGE_SITE", "SHARED"]')}\n[scopes.manifest]\nsecrets = ["SHARED", "OPTIONAL"]\n`,
      values: { ...installationValues, OPTIONAL: "--local-only" },
    });
    expect(result.exitCode).toBe(0);
    expect(forgeCalls(result).map(({ args }) => args[0])).toEqual([command]);
    expect(secretSpecCalls(result).map(({ args }) => args[0])).toEqual(["run"]);
  });
});
