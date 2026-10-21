import { expect, test } from "bun:test";
import { runCli, useBuiltCli } from "../support/cli.ts";

// Discovery must never read configuration or call SecretSpec or Forge. runCli
// poisons secretspec.toml and manifest.yml, puts failing fakes of both tools
// on PATH and asserts none was called, so one real process per command is the
// evidence; what the help says is covered in-process by help.test.ts.
useBuiltCli();

test.each([
  [],
  ["--help"],
  ["--version"],
  ["help", "doctor"],
  ["deploy", "--environment", "production", "--help"],
  ["variables", "--help"],
  ["lint", "--help"],
  ["install", "--help"],
  ["uninstall", "--help"],
  ["tunnel", "-d", "-h", "127.0.0.1", "--help"],
  ["unknown-command"],
])(
  "discovery %j stays free of configuration and tool calls",
  async (...args) => {
    for (const toolsAvailable of [false, true]) {
      const result = await runCli(args, toolsAvailable);
      expect(result.exitCode).toBe(args[0] === "unknown-command" ? 1 : 0);
    }
  },
);
