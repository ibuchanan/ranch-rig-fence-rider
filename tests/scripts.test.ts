import { describe, expect, test } from "bun:test";
import { deployScript } from "../src/deploy.ts";
import { installScript } from "../src/install.ts";
import { lintScript } from "../src/lint.ts";
import { quote, underSecretSpec } from "../src/shell.ts";
import { cli, runCli, useBuiltCli, waitUntil } from "./support/cli.ts";
import {
  type FakeRun,
  runWithFakes,
  startWithFakes,
} from "./support/shell-fakes.ts";

useBuiltCli();

const installCommands = ["install", "uninstall"] as const;
const prefix = "exec secretspec run --scope '' -- ";

describe("lint script", () => {
  test("is one exec line that hands the whole profile to forge lint", () => {
    expect(lintScript([])).toBe(`${prefix}forge lint "$@"`);
  });

  test("embeds the options it is given, quoted and in order, before the runner's arguments", () => {
    expect(
      lintScript(["--fix", "two words", "it's", "--", "--site", "x"]),
    ).toBe(`${prefix}forge lint --fix 'two words' 'it'\\''s' -- --site x "$@"`);
  });

  test.each([["--help"], ["-h"]])("%s gives usage, not a script", (flag) => {
    const usage = lintScript([flag as string]);
    expect(usage).toStartWith("Usage: fence-rider lint");
    expect(usage).toContain('cmd=$(fence-rider lint) && sh -c "$cmd" sh');
    expect(usage).not.toContain("exec secretspec");
  });
});

describe("deploy script", () => {
  const body = 'exec forge "$command" --environment "$environment" "$@"';

  test("runs the fixed target script under secretspec run, taking the environment from the profile", () => {
    const script = deployScript([]);
    expect(script).toStartWith(`${prefix}sh -c '`);
    expect(script).toEndWith(`' sh deploy "$@"`);
    expect(script).toContain("FORGE_ENVIRONMENT-development");
    expect(script).toContain(body);
    expect(script).not.toContain("--site");
  });

  test.each(
    [
      ["-e", "production"],
      ["--environment", "production"],
      ["--environment=production"],
      ["-eproduction"],
    ].map((args) => ({ args })),
  )("embeds the explicit target $args instead of the profile's", ({ args }) => {
    const script = deployScript(args);
    expect(script).toContain("environment=production\n");
    expect(script).not.toContain("FORGE_ENVIRONMENT-development");
    expect(script).toEndWith(`' sh deploy "$@"`);
  });

  test("embeds forwarded options quoted after the command word, leaving payloads after -- alone", () => {
    expect(
      deployScript(["--tag", "a b;$(id)", "-e", "x", "--", "-e", "payload"]),
    ).toEndWith(`' sh deploy --tag 'a b;$(id)' -- -e payload "$@"`);
  });

  test.each(
    [
      ["-e"],
      ["--environment", ""],
      ["--environment", "--non-interactive"],
      ["-e", "a", "--environment=b"],
    ].map((args) => ({ args })),
  )("refuses the invalid target $args", ({ args }) => {
    expect(() => deployScript(args)).toThrow();
  });

  test.each(
    [["--help"], ["-h"], ["--non-interactive", "-h"]].map((args) => ({
      args,
    })),
  )("$args gives usage, not a script", ({ args }) => {
    const usage = deployScript(args);
    expect(usage).toStartWith("Usage: fence-rider deploy");
    expect(usage).toContain('cmd=$(fence-rider deploy) && sh -c "$cmd" sh');
    expect(usage).toContain("fence-rider variables");
    expect(usage).not.toContain("exec secretspec");
  });
});

describe.each(installCommands)("%s script", (command) => {
  test("runs the fixed target script under secretspec run", () => {
    const script = installScript([], command);
    expect(script).toStartWith(`${prefix}sh -c '`);
    expect(script).toEndWith(`' sh ${command} "$@"`);
    expect(script).toContain("FORGE_ENVIRONMENT-development");
    expect(script).toContain(
      'exec forge "$command" --environment "$environment" --site "$site" --product "$product" "$@"',
    );
  });

  test("embeds forwarded options quoted after the command word", () => {
    expect(
      installScript(["--upgrade", "code", "--note", "a b;$(id)"], command),
    ).toEndWith(`' sh ${command} --upgrade code --note 'a b;$(id)' "$@"`);
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
  )("refuses target options $args", ({ args }) => {
    expect(() => installScript(args, command)).toThrow(
      "Target options are not accepted",
    );
    expect(() => installScript(args, command)).toThrow(
      "run secretspec and forge directly",
    );
  });

  test.each([["--help"], ["-h"]])("%s gives usage, not a script", (flag) => {
    const usage = installScript([flag as string], command);
    expect(usage).toStartWith(`Usage: fence-rider ${command}`);
    expect(usage).toContain(`cmd=$(fence-rider ${command}) && sh -c "$cmd" sh`);
    expect(usage).not.toContain("exec secretspec");
  });
});

test("the install and uninstall scripts differ only in the command word", () => {
  expect(installScript([], "install").replace(" sh install ", " sh X ")).toBe(
    installScript([], "uninstall").replace(" sh uninstall ", " sh X "),
  );
});

describe("shell building blocks", () => {
  test("quote leaves plain words alone and single-quotes everything else", () => {
    expect(quote("--fix")).toBe("--fix");
    expect(quote("a/b.c=d")).toBe("a/b.c=d");
    expect(quote("two words")).toBe("'two words'");
    expect(quote("it's")).toBe("'it'\\''s'");
    expect(quote("")).toBe("''");
  });

  test("underSecretSpec ends in the runner's arguments", () => {
    expect(underSecretSpec(["forge", "lint"])).toBe(`${prefix}forge lint "$@"`);
  });
});

describe("the CLI prints scripts", () => {
  test.each(["lint", "deploy", ...installCommands])(
    "%s writes exactly the script and a newline",
    async (command) => {
      const result = await runCli([command], true);
      const script =
        command === "lint"
          ? lintScript([])
          : command === "deploy"
            ? deployScript([])
            : installScript([], command as "install" | "uninstall");
      expect(result).toEqual({
        exitCode: 0,
        stdout: `${script}\n`,
        stderr: "",
      });
    },
  );

  test("deploy refuses an invalid target with nothing on stdout", async () => {
    const result = await runCli(["deploy", "-e", "--verbose"], true);
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toStartWith("Fence Rider: Invalid Forge target");
  });

  test.each(installCommands)(
    "%s refuses a target option with nothing on stdout",
    async (command) => {
      const result = await runCli([command, "--site", "x"], true);
      expect(result.exitCode).toBe(1);
      expect(result.stdout).toBe("");
      expect(result.stderr).toStartWith("Fence Rider: Target options");
    },
  );

  test.each(["lint", "deploy", ...installCommands])(
    "help %s prints usage, not a script",
    async (command) => {
      const result = await runCli(["help", command], true);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toStartWith(`Usage: fence-rider ${command}`);
      expect(result.stdout).not.toContain("exec secretspec");
    },
  );
});

const profile = {
  FORGE_ENVIRONMENT: "staging",
  FORGE_SITE: "synthetic.atlassian.net",
  FORGE_PRODUCT: "jira",
  SHARED: "synthetic-shared",
  LOCAL_ONLY: "synthetic-local",
};
const required = ["FORGE_ENVIRONMENT", "SHARED", "LOCAL_ONLY"];
const targets = (command: string, site = profile.FORGE_SITE) => [
  command,
  "--environment",
  "staging",
  "--site",
  site,
  "--product",
  "jira",
];

/** Run a generated script against the fakes with the example profile resolved. */
const run = (script: string, options: Partial<FakeRun> = {}) =>
  runWithFakes({ script, values: profile, required, ...options });

describe("running the lint script", () => {
  test("passes embedded and appended arguments to Forge as single arguments, with the profile and a stale optional visible", async () => {
    const embedded = ["--note", "a b;$(touch injected)", "'quoted'"];
    const appended = ["--extra", 'q"uote', "*", "$HOME", "`touch injected`"];
    const result = await run(lintScript(embedded), {
      appended,
      env: { OPTIONAL: "stale" },
    });
    expect(result.exitCode).toBe(0);
    expect(result.forgeArgs).toEqual(["lint", ...embedded, ...appended]);
    expect(result.forgeEnv).toMatchObject({ ...profile, OPTIONAL: "stale" });
    expect(result.secretspecArgs?.slice(0, 5)).toEqual([
      "run",
      "--scope",
      "",
      "--",
      "forge",
    ]);
  });

  test("leaves an exported variable the profile does not declare visible to Forge", async () => {
    const result = await run(lintScript([]), { env: { EXTRA: "ambient" } });
    expect(result.forgeEnv).toMatchObject({ EXTRA: "ambient", ...profile });
  });

  test("lets a resolved value win over an exported one", async () => {
    const result = await run(lintScript([]), { env: { SHARED: "ambient" } });
    expect(result.forgeEnv?.["SHARED"]).toBe("synthetic-shared");
  });

  test("replaces the shell, so no wrapper process remains", async () => {
    const result = await run(lintScript([]));
    expect(result.forgePid).toBe(result.scriptPid);
  });

  test.each([2, 23, 127, 255])(
    "exits with Forge's status %i",
    async (status) => {
      const result = await run(lintScript([]), { forgeStatus: status });
      expect(result.exitCode).toBe(status);
      expect(result.forgeArgs).toEqual(["lint"]);
    },
  );

  test.each(required)(
    "fails inside secretspec run, before Forge, when %s is not resolved",
    async (missing) => {
      const values = { ...profile } as Record<string, string>;
      delete values[missing];
      const result = await run(lintScript([]), { values });
      expect(result.exitCode).toBe(1);
      expect(result.forgeArgs).toBeUndefined();
      expect(result.stderr).toContain(`Secret '${missing}' is required`);
    },
  );

  test("exits with the status of a failing secretspec run", async () => {
    const result = await run(lintScript([]), { secretspecStatus: 5 });
    expect(result.exitCode).toBe(5);
    expect(result.forgeArgs).toBeUndefined();
  });
});

describe("running the deploy script", () => {
  const env = (args: string[] = []) => ["deploy", "--environment", ...args];

  test("passes the profile's environment, then embedded and appended arguments, under one secretspec run", async () => {
    const embedded = ["--non-interactive", "--tag", "a b;$(touch injected)"];
    const appended = ["--verbose", "--", "--environment", "x"];
    const result = await run(deployScript(embedded), {
      appended,
      env: { OPTIONAL: "stale" },
    });
    expect(result.exitCode).toBe(0);
    expect(result.forgeArgs).toEqual([
      ...env(["staging"]),
      ...embedded,
      ...appended,
    ]);
    expect(result.forgeEnv).toMatchObject({ ...profile, OPTIONAL: "stale" });
    expect(result.secretspecArgs?.slice(0, 4)).toEqual([
      "run",
      "--scope",
      "",
      "--",
    ]);
  });

  test("an explicit target wins over the resolved environment", async () => {
    const result = await run(deployScript(["-e", "production", "--verbose"]));
    expect(result.exitCode).toBe(0);
    expect(result.forgeArgs).toEqual([...env(["production"]), "--verbose"]);
  });

  test("defaults the environment to development when nothing resolves it", async () => {
    const values = { ...profile } as Record<string, string>;
    delete values["FORGE_ENVIRONMENT"];
    const result = await run(deployScript([]), {
      values,
      required: ["SHARED", "LOCAL_ONLY"],
    });
    expect(result.exitCode).toBe(0);
    expect(result.forgeArgs).toEqual(env(["development"]));
  });

  test("never uploads variables: Forge is called once, for deploy", async () => {
    const result = await run(deployScript([]));
    expect(result.forgeArgs?.slice(0, 1)).toEqual(["deploy"]);
    expect(result.forgeArgs).not.toContain("variables");
  });

  test.each(["", "-x", "--help"])(
    "refuses FORGE_ENVIRONMENT=%j without calling Forge",
    async (value) => {
      const result = await run(deployScript([]), {
        values: { ...profile, FORGE_ENVIRONMENT: value },
      });
      expect(result.exitCode).toBe(1);
      expect(result.forgeArgs).toBeUndefined();
      expect(result.stderr).toContain("target is missing or invalid");
    },
  );

  test("replaces the shell, so no wrapper process remains", async () => {
    const result = await run(deployScript([]));
    expect(result.forgePid).toBe(result.scriptPid);
  });

  test.each([2, 23, 127, 255])(
    "exits with Forge's status %i",
    async (status) => {
      const result = await run(deployScript([]), { forgeStatus: status });
      expect(result.exitCode).toBe(status);
    },
  );

  test("exits with the status of a failing secretspec run, before Forge", async () => {
    const result = await run(deployScript([]), { secretspecStatus: 5 });
    expect(result.exitCode).toBe(5);
    expect(result.forgeArgs).toBeUndefined();
  });
});

describe.each(installCommands)("running the %s script", (command) => {
  const script = (args: string[] = []) => installScript(args, command);

  test("passes the profile's targets, then embedded and appended arguments, under one secretspec run", async () => {
    const embedded = ["--upgrade", "code"];
    const appended = ["--confirm-scopes", "--non-interactive", "--", "--site"];
    const result = await run(script(embedded), {
      appended,
      env: { OPTIONAL: "stale" },
    });
    expect(result.exitCode).toBe(0);
    expect(result.forgeArgs).toEqual([
      ...targets(command),
      ...embedded,
      ...appended,
    ]);
    expect(result.forgeEnv).toMatchObject({ ...profile, OPTIONAL: "stale" });
    expect(result.secretspecArgs?.slice(0, 4)).toEqual([
      "run",
      "--scope",
      "",
      "--",
    ]);
  });

  test("keeps shell metacharacters in arguments and in resolved targets as single arguments", async () => {
    const appended = ["a b;$(touch injected)", "'quoted'", '"double"', "*"];
    const site = "my site;$(touch injected)`touch injected`.atlassian.net";
    const result = await run(script(["--note", "x y"]), {
      appended,
      values: { ...profile, FORGE_SITE: site },
    });
    expect(result.exitCode).toBe(0);
    expect(result.forgeArgs).toEqual([
      ...targets(command, site),
      "--note",
      "x y",
      ...appended,
    ]);
  });

  test.each(
    ["FORGE_ENVIRONMENT", "FORGE_SITE", "FORGE_PRODUCT"].flatMap((name) =>
      ["", "-x", "--help"].map((value) => ({ name, value })),
    ),
  )("refuses $name=$value without calling Forge", async ({ name, value }) => {
    const result = await run(script(), {
      values: { ...profile, [name]: value },
    });
    expect(result.exitCode).toBe(1);
    expect(result.forgeArgs).toBeUndefined();
    expect(result.stderr).toContain("target is missing or invalid");
  });

  test.each(["FORGE_SITE", "FORGE_PRODUCT"])(
    "refuses a profile that does not resolve %s",
    async (missing) => {
      const values = { ...profile } as Record<string, string>;
      delete values[missing];
      const result = await run(script(), { values });
      expect(result.exitCode).toBe(1);
      expect(result.forgeArgs).toBeUndefined();
      expect(result.stderr).toContain("target is missing or invalid");
    },
  );

  test("defaults the environment to development when nothing resolves it", async () => {
    const values = { ...profile } as Record<string, string>;
    delete values["FORGE_ENVIRONMENT"];
    const result = await run(script(), {
      values,
      required: ["SHARED", "LOCAL_ONLY"],
    });
    expect(result.exitCode).toBe(0);
    expect(result.forgeArgs?.slice(0, 3)).toEqual([
      command,
      "--environment",
      "development",
    ]);
  });

  test("uses an exported FORGE_SITE the profile does not resolve, but prefers a resolved one", async () => {
    const values = { ...profile } as Record<string, string>;
    delete values["FORGE_SITE"];
    const env = { FORGE_SITE: "ambient.atlassian.net" };
    const fallback = await run(script(), { values, env });
    expect(fallback.exitCode).toBe(0);
    expect(fallback.forgeArgs?.[4]).toBe("ambient.atlassian.net");
    const resolved = await run(script(), { env });
    expect(resolved.forgeArgs?.[4]).toBe("synthetic.atlassian.net");
  });

  test("replaces the shell, so no wrapper process remains", async () => {
    const result = await run(script());
    expect(result.forgePid).toBe(result.scriptPid);
  });

  test("fails inside secretspec run, before Forge, when a required value is missing", async () => {
    const values = { ...profile } as Record<string, string>;
    delete values["LOCAL_ONLY"];
    const result = await run(script(), { values });
    expect(result.exitCode).toBe(1);
    expect(result.forgeArgs).toBeUndefined();
    expect(result.stderr).toContain("LOCAL_ONLY");
  });

  test.each([2, 23, 127, 255])(
    "exits with Forge's status %i",
    async (status) => {
      const result = await run(script(), { forgeStatus: status });
      expect(result.exitCode).toBe(status);
      expect(result.forgeArgs?.[0]).toBe(command);
    },
  );

  test("exits with the status of a failing secretspec run", async () => {
    const result = await run(script(), { secretspecStatus: 5 });
    expect(result.exitCode).toBe(5);
    expect(result.forgeArgs).toBeUndefined();
  });
});

describe("the package.json idiom", () => {
  const idiom = (command: string, ...args: string[]) =>
    `cmd=$(fence-rider ${[command, ...args].map(quote).join(" ")}) && sh -c "$cmd" sh "$@"`;

  test("runs the generated script with the runner's arguments", async () => {
    const result = await run(idiom("lint", "--verbose"), {
      appended: ["extra arg", 'q"uote'],
    });
    expect(result.exitCode).toBe(0);
    expect(result.forgeArgs).toEqual([
      "lint",
      "--verbose",
      "extra arg",
      'q"uote',
    ]);
  });

  test.each(installCommands)(
    "a guarded %s stops when fence-rider refuses",
    async (command) => {
      const result = await run(idiom(command, "--site", "x"), {});
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain("Target options are not accepted");
      expect(result.forgeArgs).toBeUndefined();
      expect(result.secretspecArgs).toBeUndefined();
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

test.each([
  ["lint", lintScript([])],
  ["deploy", deployScript([])],
  ["install", installScript([], "install")],
  ["uninstall", installScript([], "uninstall")],
] as const)(
  "the %s script streams before exit and inherits input, ordinary settings and authentication without redaction",
  async (command, script) => {
    const { child } = startWithFakes({
      script,
      values: profile,
      required,
      stream: true,
      env: {
        ORDINARY_SETTING: "synthetic-setting",
        FORGE_API_TOKEN: "synthetic-auth",
      },
    });
    let stdout = "";
    const output = (async () => {
      for await (const chunk of child.stdout)
        stdout += new TextDecoder().decode(chunk);
    })();
    const errors = new Response(child.stderr).text();
    try {
      await waitUntil(
        () => stdout.includes("synthetic forge result"),
        `live ${command} output before input`,
      );
      expect(child.exitCode).toBeNull();
      child.stdin.write("synthetic-input");
      child.stdin.end();
      expect(await child.exited).toBe(0);
      await output;
      expect(stdout).toContain("input:synthetic-input");
      expect(stdout).toContain("ordinary:synthetic-setting");
      expect(stdout).toContain("auth:synthetic-auth");
      expect(await errors).toBe("synthetic forge warning\n");
    } finally {
      child.stdin.end();
      child.kill("SIGKILL");
      await child.exited;
      await output;
      await errors;
    }
  },
);
