import { expect, test } from "bun:test";
import { join } from "node:path";
import { root } from "../support/cli.ts";
import { runMain } from "../support/main.ts";

const workflows = [
  "deploy",
  "variables",
  "lint",
  "install",
  "uninstall",
  "tunnel",
];

test.each([[], ["help"], ["--help"], ["-h"]].map((args) => ({ args })))(
  "help $args describes the initial workflow",
  async ({ args }) => {
    const result = await runMain(args);
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain("Usage: fence-rider");
    expect(result.stdout).toContain("deploy");
    expect(result.stdout).toContain("variables");
    expect(result.stdout).toContain("encrypted runtime variables");
    expect(result.stdout).toContain("SecretSpec CLI");
    expect(result.stdout).toContain("Forge CLI");
    expect(result.stdout).toContain("PATH");
    expect(result.stdout).toContain("install");
    expect(result.stdout).toContain("tunnel");
  },
);

test.each(workflows)(
  "help and --help print the same usage for %s",
  async (command) => {
    const viaHelp = await runMain(["help", command]);
    const viaFlag = await runMain([command, "--help"]);
    expect(viaHelp.exitCode).toBe(0);
    expect(viaHelp.stderr).toBe("");
    expect(viaHelp.stdout).toStartWith(`Usage: fence-rider ${command} `);
    expect(viaFlag).toEqual(viaHelp);
  },
);

test("top-level help lists every supported workflow", async () => {
  const result = await runMain(["--help"]);
  for (const command of workflows)
    expect(result.stdout).toMatch(new RegExp(`^  ${command} {2,}\\S`, "m"));
});

test.each(["--version", "-V"])(
  "%s prints the package version",
  async (flag) => {
    const { version } = await Bun.file(join(root, "package.json")).json();
    const result = await runMain([flag]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe(`fence-rider ${version}`);
    expect(result.stderr).toBe("");
  },
);

test.each([
  { args: ["unknown-command"] },
  { args: ["unknown-command", "--help"] },
  { args: ["help", "unknown-command"] },
  { args: ["help", "deploy", "--unknown-option"] },
  { args: ["--unknown-option"] },
])("unknown invocation %j fails with guidance", async ({ args }) => {
  const result = await runMain(args);
  expect(result.exitCode).not.toBe(0);
  expect(result.stdout).toBe("");
  expect(result.stderr).toContain("Unknown command");
  expect(result.stderr).toContain("fence-rider --help");
  expect(result.stderr).toContain("Forge CLI");
});

test.each([
  { args: ["tunnel", "--help"] },
  { args: ["help", "tunnel"] },
  { args: ["tunnel", "-d", "-h", "127.0.0.1", "--help"] },
])("tunnel discovery %j documents the tunnel", async ({ args }) => {
  const result = await runMain(args);
  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain("Usage: fence-rider tunnel");
  expect(result.stdout).toContain("FORGE_USER_VAR_");
  expect(result.stdout).toContain("unredacted");
  expect(result.stdout).toContain("-h is debug host");
  expect(result.stderr).toBe("");
});

test.each([
  { args: ["deploy", "--environment", "production", "--help"] },
  { args: ["deploy", "--non-interactive", "-h"] },
])("deployment help with options %j prints usage", async ({ args }) => {
  const result = await runMain(args);
  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain("Usage: fence-rider deploy");
  expect(result.stderr).toBe("");
});

test("deployment help documents the environment control and the separate upload", async () => {
  const result = await runMain(["deploy", "--help"]);
  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain("FORGE_ENVIRONMENT");
  expect(result.stdout).not.toContain("FORGE_ENV legacy alias");
  expect(result.stdout).toContain("fence-rider variables");
  expect(result.stdout).toContain("unredacted");
  expect(result.stderr).toBe("");
});

test.each([
  { args: ["variables", "--help"] },
  { args: ["variables", "-h"] },
  { args: ["variables", "--environment", "production", "--help"] },
])("variables help %j documents uploads", async ({ args }) => {
  const result = await runMain(args);
  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain("Usage: fence-rider variables");
  expect(result.stdout).toContain("deploy never uploads");
  expect(result.stdout).toContain("not rolled back");
  expect(result.stderr).toBe("");
});

test.each([
  { args: ["lint", "--help"] },
  { args: ["lint", "-h"] },
  { args: ["help", "lint"] },
  { args: ["lint", "--fix", "--help"] },
])("lint discovery %j documents lint", async ({ args }) => {
  const result = await runMain(args);
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
)("uninstall help %j documents its own policy", async ({ args }) => {
  const result = await runMain(args);
  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain("Usage: fence-rider uninstall");
  expect(result.stdout).toContain("FORGE_SITE");
  expect(result.stdout).toContain("remote installation state");
  expect(result.stdout).toContain("does not support --non-interactive");
  expect(result.stdout).toContain("unredacted");
  expect(result.stderr).toBe("");
});

test.each(
  [
    ["install", "--help"],
    ["install", "-h"],
    ["help", "install"],
    ["install", "--upgrade", "--help"],
    ["install", "--license-modes", "user-access", "--help"],
  ].map((args) => ({ args })),
)("installation help %j documents installation", async ({ args }) => {
  const result = await runMain(args);
  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain("install");
  expect(result.stdout).toContain("FORGE_SITE");
  expect(result.stdout).toContain("unredacted");
  expect(result.stderr).toBe("");
});
