import { expect, test } from "bun:test";
import { runCli, useBuiltCli } from "../support/cli.ts";

// Discovery must never read configuration or call SecretSpec or Forge. runCli
// poisons secretspec.toml and manifest.yml, puts failing fakes of both tools
// on PATH and asserts none was called, so one real process per command is the
// evidence; what the help says is covered in-process by help.test.ts.
useBuiltCli();

const discoveryArgs: string[][] = [
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
];

test.each(
  discoveryArgs.flatMap((args) =>
    [false, true].map((toolsAvailable) => ({ args, toolsAvailable })),
  ),
)(
  "discovery $args stays free of configuration and tool calls (tools available: $toolsAvailable)",
  async ({ args, toolsAvailable }) => {
    const result = await runCli(args, toolsAvailable);
    expect(result.exitCode).toBe(args[0] === "unknown-command" ? 1 : 0);
  },
);
