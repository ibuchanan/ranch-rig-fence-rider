import { describe, expect, test } from "bun:test";
import { deployScript } from "../../src/deploy.ts";
import { installScript } from "../../src/install.ts";
import { lintScript } from "../../src/lint.ts";
import { quote, underSecretSpec } from "../../src/shell.ts";
import { runMain } from "../support/main.ts";

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
      const result = await runMain([command]);
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
    const result = await runMain(["deploy", "-e", "--verbose"]);
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toStartWith("Fence Rider: Invalid Forge target");
  });

  test.each(installCommands)(
    "%s refuses a target option with nothing on stdout",
    async (command) => {
      const result = await runMain([command, "--site", "x"]);
      expect(result.exitCode).toBe(1);
      expect(result.stdout).toBe("");
      expect(result.stderr).toStartWith("Fence Rider: Target options");
    },
  );

  test.each(["lint", "deploy", ...installCommands])(
    "help %s prints usage, not a script",
    async (command) => {
      const result = await runMain(["help", command]);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toStartWith(`Usage: fence-rider ${command}`);
      expect(result.stdout).not.toContain("exec secretspec");
    },
  );
});
