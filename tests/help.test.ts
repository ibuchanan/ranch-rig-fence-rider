import { expect, test } from "bun:test";
import { join } from "node:path";
import { root, runCli, useBuiltCli } from "./support/cli.ts";

useBuiltCli();

test("no command prints help without external tools or valid configuration", async () => {
  const result = await runCli([]);
  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain("Usage: fence-rider");
  expect(result.stderr).toBe("");
});

test.each(["deploy", "lint", "install", "uninstall", "tunnel"])(
  "help and --help print the same usage for %s",
  async (command) => {
    const viaHelp = await runCli(["help", command], true);
    const viaFlag = await runCli([command, "--help"], true);
    expect(viaHelp.exitCode).toBe(0);
    expect(viaHelp.stderr).toBe("");
    expect(viaHelp.stdout).toStartWith(`Usage: fence-rider ${command} `);
    expect(viaFlag).toEqual(viaHelp);
  },
);

test("help setup describes the setup command", async () => {
  const result = await runCli(["help", "setup"], true);
  expect(result.exitCode).toBe(0);
  expect(result.stdout).toStartWith("Usage: fence-rider setup");
  expect(result.stderr).toBe("");
});

test("top-level help lists every supported workflow", async () => {
  const result = await runCli(["--help"]);
  for (const command of ["deploy", "lint", "install", "uninstall", "tunnel"])
    expect(result.stdout).toMatch(new RegExp(`^  ${command} {2,}\\S`, "m"));
});

test.each(["--version", "-V"])(
  "%s prints the package version without tool calls",
  async (flag) => {
    const { version } = await Bun.file(join(root, "package.json")).json();
    for (const toolsAvailable of [false, true]) {
      const result = await runCli([flag], toolsAvailable);
      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim()).toBe(`fence-rider ${version}`);
      expect(result.stderr).toBe("");
    }
  },
);

test.each([
  { args: ["unknown-command"] },
  { args: ["unknown-command", "--help"] },
  { args: ["help", "unknown-command"] },
  { args: ["help", "deploy", "--unknown-option"] },
  { args: ["--unknown-option"] },
])("unknown invocation %j fails without tool calls", async ({ args }) => {
  for (const toolsAvailable of [false, true]) {
    const result = await runCli(args, toolsAvailable);
    expect(result.exitCode).not.toBe(0);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("Unknown command");
    expect(result.stderr).toContain("fence-rider --help");
    expect(result.stderr).toContain("Forge CLI");
  }
});

test.each([
  { args: ["tunnel", "--help"] },
  { args: ["help", "tunnel"] },
  { args: ["tunnel", "-d", "-h", "127.0.0.1", "--help"] },
])(
  "configured tunnel discovery %j never resolves configuration",
  async ({ args }) => {
    for (const toolsAvailable of [false, true]) {
      const result = await runCli(args, toolsAvailable);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("Usage: fence-rider tunnel");
      expect(result.stdout).toContain("FORGE_USER_VAR_");
      expect(result.stdout).toContain("unredacted");
      expect(result.stdout).toContain("-h is debug host");
      expect(result.stderr).toBe("");
    }
  },
);

test.each([
  { args: ["deploy", "--environment", "production", "--help"] },
  { args: ["deploy", "--non-interactive", "-h"] },
  { args: ["deploy", "-fh"] },
])(
  "deployment help with options %j stays side-effect-free",
  async ({ args }) => {
    const result = await runCli(args, true);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Usage: fence-rider deploy");
    expect(result.stderr).toBe("");
  },
);

test("deployment help documents canonical migration without resolving secrets", async () => {
  const result = await runCli(["deploy", "--help"], true);
  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain("FORGE_ENVIRONMENT");
  expect(result.stdout).toContain("FORGE_ENV legacy alias");
  expect(result.stdout).toContain(
    "Conflicting resolved names fail even with an explicit target.",
  );
  expect(result.stderr).toBe("");
});

test.each([
  { args: ["lint", "--help"] },
  { args: ["lint", "-h"] },
  { args: ["help", "lint"] },
  { args: ["lint", "--fix", "--help"] },
])("configured lint discovery %j never invokes tools", async ({ args }) => {
  const result = await runCli(args, true);
  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain("lint");
  expect(result.stdout).toContain("unredacted");
  expect(result.stderr).toBe("");
});

test.each(
  [
    ["uninstall", "--help"],
    ["uninstall", "-h"],
    ["help", "uninstall"],
    ["uninstall", "--verbose", "--help"],
  ].map((args) => ({ args })),
)(
  "configured uninstall help %j stays configuration-free and documents its own policy",
  async ({ args }) => {
    const result = await runCli(args, true);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Usage: fence-rider uninstall");
    expect(result.stdout).toContain("FORGE_SITE");
    expect(result.stdout).toContain("remote installation state");
    expect(result.stdout).toContain("does not support --non-interactive");
    expect(result.stdout).toContain("unredacted");
    expect(result.stderr).toBe("");
  },
);

test.each(
  [
    ["install", "--help"],
    ["install", "-h"],
    ["help", "install"],
    ["install", "--upgrade", "--help"],
    ["install", "--license-modes", "user-access", "--help"],
  ].map((args) => ({ args })),
)(
  "configured installation help %j stays configuration-free",
  async ({ args }) => {
    const result = await runCli(args, true);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("install");
    expect(result.stdout).toContain("FORGE_SITE");
    expect(result.stdout).toContain("unredacted");
    expect(result.stderr).toBe("");
  },
);

for (const toolsAvailable of [false, true]) {
  test.each([[], ["help"], ["--help"], ["-h"]].map((args) => ({ args })))(
    `help %j describes the initial workflow without configuration or tool calls (tools available: ${toolsAvailable})`,
    async ({ args }) => {
      const result = await runCli(args, toolsAvailable);
      expect(result.exitCode).toBe(0);
      expect(result.stderr).toBe("");
      expect(result.stdout).toContain("Usage: fence-rider");
      expect(result.stdout).toContain("deploy");
      expect(result.stdout).toContain("encrypted runtime variables");
      expect(result.stdout).toContain("SecretSpec CLI");
      expect(result.stdout).toContain("Forge CLI");
      expect(result.stdout).toContain("PATH");
      expect(result.stdout).toContain("install");
      expect(result.stdout).toContain("tunnel");
    },
  );
}
