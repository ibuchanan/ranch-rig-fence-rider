import { describe, expect, test } from "bun:test";
import { cli, runCli, useBuiltCli, waitUntil } from "./support/cli.ts";
import {
  deploymentEnv,
  deploymentSchema,
  deploymentValues,
  installationOptions,
  installationValues,
  prepareProject,
  runIdiom,
  runScript,
  sharedValue,
  type ToolCall,
  type WorkflowOptions,
} from "./support/fixtures.ts";

useBuiltCli();

const installCommands = ["install", "uninstall"] as const;
const prefix = "exec secretspec run --scope '' -- ";

describe("lint script", () => {
  test("is one exec line that hands the whole profile to forge lint", async () => {
    const result = await runCli(["lint"], true);
    expect(result).toEqual({
      exitCode: 0,
      stdout: `${prefix}forge lint "$@"\n`,
      stderr: "",
    });
  });

  test("embeds the options it is given, quoted and in order, before the runner's arguments", async () => {
    const result = await runCli(
      ["lint", "--fix", "two words", "it's", "--", "--site", "x"],
      true,
    );
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe(
      `${prefix}forge lint --fix 'two words' 'it'\\''s' -- --site x "$@"\n`,
    );
  });

  test.each([
    { args: ["lint", "--help"] },
    { args: ["lint", "-h"] },
    { args: ["help", "lint"] },
  ])("$args prints usage, not a script", async ({ args }) => {
    const result = await runCli(args, true);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toStartWith("Usage: fence-rider lint");
    expect(result.stdout).toContain(
      'cmd=$(fence-rider lint) && sh -c "$cmd" sh',
    );
    expect(result.stdout).not.toContain("exec secretspec");
    expect(result.stderr).toBe("");
  });
});

describe.each(installCommands)("%s script", (command) => {
  test("runs the fixed target script under secretspec run", async () => {
    const result = await runCli([command], true);
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toStartWith(`${prefix}sh -c '`);
    expect(result.stdout).toEndWith(`' sh ${command} "$@"\n`);
    expect(result.stdout.trimEnd().split("\n").at(0)).toStartWith(prefix);
    expect(result.stdout).toContain("FORGE_ENVIRONMENT-development");
    expect(result.stdout).toContain(
      'exec forge "$command" --environment "$environment" --site "$site" --product "$product" "$@"',
    );
  });

  test("differs between commands only in the command word", async () => {
    const [install, uninstall] = await Promise.all([
      runCli(["install"], true),
      runCli(["uninstall"], true),
    ]);
    expect(install.stdout.replace(" sh install ", " sh COMMAND ")).toBe(
      uninstall.stdout.replace(" sh uninstall ", " sh COMMAND "),
    );
  });

  test("embeds forwarded options quoted after the command word", async () => {
    const result = await runCli(
      [command, "--upgrade", "code", "--note", "a b;$(id)"],
      true,
    );
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toEndWith(
      `' sh ${command} --upgrade code --note 'a b;$(id)' "$@"\n`,
    );
  });

  test.each(
    [
      ["--site", "other.atlassian.net"],
      ["--site=other.atlassian.net"],
      ["-sother.atlassian.net"],
      ["-s", "other.atlassian.net"],
      ["--product", "confluence"],
      ["--product=confluence"],
      ["-p", "confluence"],
      ["--environment", "production"],
      ["-e", "production"],
      ["-eproduction"],
      ["--verbose", "--environment=production"],
    ].map((args) => ({ args })),
  )("refuses target options $args with nothing on stdout", async ({ args }) => {
    const result = await runCli([command, ...args], true);
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("Target options are not accepted");
    expect(result.stderr).toContain("run secretspec and forge directly");
  });

  test.each([
    { args: [command, "--help"] },
    { args: [command, "-h"] },
    { args: ["help", command] },
  ])("$args prints usage, not a script", async ({ args }) => {
    const result = await runCli(args, true);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toStartWith(`Usage: fence-rider ${command}`);
    expect(result.stdout).toContain(
      `cmd=$(fence-rider ${command}) && sh -c "$cmd" sh`,
    );
    expect(result.stdout).not.toContain("exec secretspec");
  });
});

const forgeCalls = (interactions: ToolCall[]) =>
  interactions.filter(({ tool }) => tool === "forge");
const secretSpecCalls = (interactions: ToolCall[]) =>
  interactions.filter(({ tool }) => tool === "secretspec");

describe("running the lint script", () => {
  test("passes embedded and appended arguments to Forge as single arguments with the profile in its environment", async () => {
    const generate = ["--note", "a b;$(touch injected)", "'quoted'"];
    const appended = ["--extra", 'q"uote', "*", "$HOME", "`touch injected`"];
    const result = await runScript({
      command: "lint",
      generate,
      appended,
      env: { OPTIONAL: "stale" },
    });
    expect(result.exitCode).toBe(0);
    expect(forgeCalls(result.interactions)).toEqual([
      {
        tool: "forge",
        args: ["lint", ...generate, ...appended],
        // secretspec run does not clear a stale value for an unresolved optional.
        values: { ...deploymentValues, OPTIONAL: "stale" },
      },
    ]);
    const [call, ...others] = secretSpecCalls(result.interactions);
    expect(others).toEqual([]);
    expect(call?.args.slice(0, 5)).toEqual([
      "run",
      "--scope",
      "",
      "--",
      "forge",
    ]);
    expect(result.stdout).toContain("synthetic lint result");
    expect(result.stderr).toBe("synthetic lint warning\n");
  });

  test("leaves an exported variable the profile does not declare visible to Forge", async () => {
    const result = await runScript({
      command: "lint",
      schema: {
        ...deploymentSchema,
        properties: {
          ...deploymentSchema.properties,
          EXTRA: { type: "string" },
        },
      },
      env: { EXTRA: "ambient-extra" },
    });
    expect(result.exitCode).toBe(0);
    expect(result.interactions.at(-1)?.values).toEqual({
      ...deploymentValues,
      EXTRA: "ambient-extra",
    });
  });

  test.each([2, 23, 127, 255])(
    "exits with Forge's status %i",
    async (exitCode) => {
      const result = await runScript({
        command: "lint",
        failStage: "lint",
        exitCode,
      });
      expect(result.exitCode).toBe(exitCode);
      expect(result.stderr).toContain("synthetic lint warning");
    },
  );

  test.each(["SHARED", "LOCAL_ONLY", "FORGE_ENVIRONMENT"])(
    "fails inside secretspec run, before Forge, when %s is not resolved",
    async (missing) => {
      const values: Record<string, string> = { ...deploymentValues };
      delete values[missing];
      const result = await runScript({ command: "lint", values });
      expect(result.exitCode).toBe(1);
      expect(forgeCalls(result.interactions)).toEqual([]);
      expect(result.stderr).toContain(`Secret '${missing}' is required`);
    },
  );

  test("exits with the status of a failing secretspec run", async () => {
    const result = await runScript({
      command: "lint",
      failStage: "run",
      exitCode: 5,
    });
    expect(result.exitCode).toBe(5);
    expect(forgeCalls(result.interactions)).toEqual([]);
  });

  test("makes no call to schema, export or check and needs no manifest", async () => {
    const result = await runScript({ command: "lint", manifest: null });
    expect(result.exitCode).toBe(0);
    expect(
      secretSpecCalls(result.interactions).map(({ args }) => args[0]),
    ).toEqual(["run"]);
  });
});

describe.each(installCommands)("running the %s script", (command) => {
  const targets = (site = "synthetic.atlassian.net") => [
    command,
    "--environment",
    "staging",
    "--site",
    site,
    "--product",
    "jira",
  ];

  test("passes the profile's targets, then embedded and appended arguments, under one secretspec run", async () => {
    const generate = ["--upgrade", "code"];
    const appended = ["--confirm-scopes", "--non-interactive", "--", "--site"];
    const result = await runScript({
      command,
      generate,
      appended,
      env: { OPTIONAL: "stale" },
    });
    expect(result.exitCode).toBe(0);
    expect(forgeCalls(result.interactions)).toEqual([
      {
        tool: "forge",
        args: [...targets(), ...generate, ...appended],
        values: { ...installationValues, OPTIONAL: "stale" },
      },
    ]);
    expect(
      secretSpecCalls(result.interactions).map(({ args }) => args[0]),
    ).toEqual(["run"]);
    expect(result.stdout).toContain(`synthetic ${command} result`);
  });

  test("keeps shell metacharacters in arguments and in resolved targets as single arguments", async () => {
    const appended = ["a b;$(touch injected)", "'quoted'", '"double"', "*"];
    const site = "my site;$(touch injected)`touch injected`.atlassian.net";
    const result = await runScript({
      command,
      generate: ["--note", "x y"],
      appended,
      values: { ...installationValues, FORGE_SITE: site },
    });
    expect(result.exitCode).toBe(0);
    expect(forgeCalls(result.interactions).map(({ args }) => args)).toEqual([
      [...targets(site), "--note", "x y", ...appended],
    ]);
  });

  test.each(
    ["FORGE_ENVIRONMENT", "FORGE_SITE", "FORGE_PRODUCT"].flatMap((name) =>
      ["", "-x", "--help"].map((value) => ({ name, value })),
    ),
  )("refuses $name=$value without calling Forge", async ({ name, value }) => {
    const result = await runScript({
      command,
      values: { ...installationValues, [name]: value },
    });
    expect(result.exitCode).toBe(1);
    expect(forgeCalls(result.interactions)).toEqual([]);
    expect(result.stderr).toContain("target is missing or invalid");
  });

  test.each(["FORGE_SITE", "FORGE_PRODUCT"])(
    "refuses a profile that does not resolve %s",
    async (missing) => {
      const values: Record<string, string> = { ...installationValues };
      delete values[missing];
      const result = await runScript({ command, values });
      expect(result.exitCode).toBe(1);
      expect(forgeCalls(result.interactions)).toEqual([]);
      expect(result.stderr).toContain("target is missing or invalid");
    },
  );

  test("defaults the environment to development when the profile does not resolve it", async () => {
    const values: Record<string, string> = { ...installationValues };
    delete values["FORGE_ENVIRONMENT"];
    const result = await runScript({
      command,
      values,
      schema: {
        ...deploymentSchema,
        properties: {
          ...deploymentSchema.properties,
          FORGE_SITE: { type: "string" },
          FORGE_PRODUCT: { type: "string" },
        },
        required: ["SHARED", "LOCAL_ONLY"],
      },
    });
    expect(result.exitCode).toBe(0);
    expect(
      forgeCalls(result.interactions).map(({ args }) => args.slice(0, 3)),
    ).toEqual([[command, "--environment", "development"]]);
  });

  test("uses an exported FORGE_SITE the profile does not resolve, but prefers a resolved one", async () => {
    const values: Record<string, string> = { ...installationValues };
    delete values["FORGE_SITE"];
    const fallback = await runScript({
      command,
      values,
      env: { FORGE_SITE: "ambient.atlassian.net" },
    });
    expect(fallback.exitCode).toBe(0);
    expect(
      forgeCalls(fallback.interactions).map(({ args }) => args[4]),
    ).toEqual(["ambient.atlassian.net"]);
    const resolved = await runScript({
      command,
      env: { FORGE_SITE: "ambient.atlassian.net" },
    });
    expect(
      forgeCalls(resolved.interactions).map(({ args }) => args[4]),
    ).toEqual(["synthetic.atlassian.net"]);
  });

  test("fails inside secretspec run, before Forge, when a required value is missing", async () => {
    const values: Record<string, string> = { ...installationValues };
    delete values["LOCAL_ONLY"];
    const result = await runScript({ command, values });
    expect(result.exitCode).toBe(1);
    expect(forgeCalls(result.interactions)).toEqual([]);
    expect(result.stderr).toContain("LOCAL_ONLY");
  });

  test.each([2, 23, 127, 255])(
    "exits with Forge's status %i",
    async (exitCode) => {
      const result = await runScript({ command, failStage: command, exitCode });
      expect(result.exitCode).toBe(exitCode);
      expect(
        forgeCalls(result.interactions).map(({ args }) => args[0]),
      ).toEqual([command]);
    },
  );

  test("exits with the status of a failing secretspec run", async () => {
    const result = await runScript({
      command,
      failStage: "run",
      exitCode: 5,
    });
    expect(result.exitCode).toBe(5);
    expect(forgeCalls(result.interactions)).toEqual([]);
  });

  test("refused options never reach a shell", async () => {
    const result = await runScript({
      command,
      generate: ["--site", "x"],
    });
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.interactions).toEqual([]);
  });
});

describe("the package.json idiom", () => {
  test("runs the generated script with the runner's arguments", async () => {
    const result = await runIdiom({
      command: "lint",
      generate: ["--verbose"],
      appended: ["extra arg", 'q"uote'],
    });
    expect(result.exitCode).toBe(0);
    expect(forgeCalls(result.interactions).map(({ args }) => args)).toEqual([
      ["lint", "--verbose", "extra arg", 'q"uote'],
    ]);
  });

  test.each(installCommands)(
    "a guarded %s stops when fence-rider refuses",
    async (command) => {
      const result = await runIdiom({ command, generate: ["--site", "x"] });
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain("Target options are not accepted");
      expect(result.interactions).toEqual([]);
    },
  );

  test("an unguarded eval would not notice a refusal", () => {
    // The reason the documented idiom is `cmd=$(…) && …` and not `eval "$(…)"`.
    const unguarded = Bun.spawnSync(
      [
        "/bin/sh",
        "-c",
        'eval "$("$0" install --site x 2>/dev/null)"',
        cli.executable,
      ],
      { env: {} },
    );
    expect(unguarded.exitCode).toBe(0);
  });
});

test.each(["lint", "install", "uninstall"] as const)(
  "the %s script streams before exit and inherits input, ordinary settings and authentication without redaction",
  async (command) => {
    const options: WorkflowOptions = {
      ...(command === "lint" ? {} : installationOptions),
      env: {
        LINT_READ_INPUT: "1",
        ORDINARY_SETTING: "synthetic-setting",
        FORGE_API_TOKEN: "synthetic-auth",
      },
    };
    const project = prepareProject(options);
    const env = deploymentEnv(project, options);
    const script = Bun.spawnSync([cli.executable, command], {
      cwd: project,
      env,
    }).stdout.toString();
    const child = Bun.spawn(["/bin/sh", "-c", script, "sh"], {
      cwd: project,
      env,
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe",
    });
    let stdout = "";
    const output = (async () => {
      for await (const chunk of child.stdout)
        stdout += new TextDecoder().decode(chunk);
    })();
    const errors = new Response(child.stderr).text();
    try {
      await waitUntil(
        () => stdout.includes(`synthetic ${command} result`),
        `live ${command} output before input`,
      );
      expect(child.exitCode).toBeNull();
      child.stdin.write(sharedValue);
      child.stdin.end();
      expect(await child.exited).toBe(0);
      await output;
      expect(stdout).toContain(`input:${sharedValue}`);
      expect(stdout).toContain("ordinary:synthetic-setting");
      expect(stdout).toContain("auth:synthetic-auth");
      expect(await errors).toBe(`synthetic ${command} warning\n`);
    } finally {
      child.stdin.end();
      child.kill("SIGKILL");
      await child.exited;
      await output;
      await errors;
    }
  },
);
