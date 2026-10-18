import { afterAll, beforeAll, expect, test } from "bun:test";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const workspace = mkdtempSync(join(root, "tmp_rovo_cli-"));
const executable = join(workspace, "fence-rider");

beforeAll(async () => {
  const build = Bun.spawn(
    [
      process.execPath,
      "build",
      "--compile",
      join(root, "src/index.ts"),
      "--outfile",
      executable,
    ],
    { cwd: workspace, stdout: "pipe", stderr: "pipe" },
  );
  const [exitCode, stdout, stderr] = await Promise.all([
    build.exited,
    new Response(build.stdout).text(),
    new Response(build.stderr).text(),
  ]);
  expect({ exitCode, stderr: exitCode === 0 ? "" : stdout + stderr }).toEqual({
    exitCode: 0,
    stderr: "",
  });
}, 30_000);

afterAll(() => rmSync(workspace, { recursive: true, force: true }));

async function invoke(args: readonly string[], toolsAvailable = false) {
  const project = mkdtempSync(join(workspace, "project-"));
  const bin = join(project, "bin");
  const calls = join(project, "tool-calls");
  mkdirSync(bin);
  if (toolsAvailable) {
    for (const tool of ["secretspec", "forge"]) {
      writeFileSync(
        join(bin, tool),
        '#!/bin/sh\nprintf "%s\\n" "$0" >> "$TOOL_CALL_LOG"\nexit 99\n',
        { mode: 0o755 },
      );
    }
  }
  writeFileSync(join(project, "secretspec.toml"), "not valid TOML = [");
  writeFileSync(join(project, "manifest.yml"), "not valid YAML: [");
  const child = Bun.spawn([executable, ...args], {
    cwd: project,
    env: { PATH: bin, HOME: project, TMPDIR: project, TOOL_CALL_LOG: calls },
    stdout: "pipe",
    stderr: "pipe",
  });
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  expect(existsSync(calls)).toBe(false);
  return { exitCode, stdout, stderr };
}

test("no command prints help without external tools or valid configuration", async () => {
  const result = await invoke([]);
  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain("Usage: fence-rider");
  expect(result.stderr).toBe("");
});

test.each(["--version", "-V"])(
  "%s prints the package version without tool calls",
  async (flag) => {
    const { version } = await Bun.file(join(root, "package.json")).json();
    for (const toolsAvailable of [false, true]) {
      const result = await invoke([flag], toolsAvailable);
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
  { args: ["--unknown-option"] },
])("unknown invocation %j fails without tool calls", async ({ args }) => {
  for (const toolsAvailable of [false, true]) {
    const result = await invoke(args, toolsAvailable);
    expect(result.exitCode).not.toBe(0);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("Unknown command");
    expect(result.stderr).toContain("fence-rider --help");
    expect(result.stderr).toContain("Forge CLI");
  }
});

test.each(["install", "tunnel"])(
  "%s directs developers to Forge without tool calls",
  async (command) => {
    for (const toolsAvailable of [false, true]) {
      for (const args of [[command], [command, "--help"], ["help", command]]) {
        const result = await invoke(args, toolsAvailable);
        expect(result.exitCode).not.toBe(0);
        expect(result.stdout).toBe("");
        expect(result.stderr).toContain(`${command} is unsupported`);
        expect(result.stderr).toContain(`forge ${command}`);
      }
    }
  },
);

test("deployment is explicitly unavailable until its implementation ticket", async () => {
  for (const toolsAvailable of [false, true]) {
    const result = await invoke(["deploy"], toolsAvailable);
    expect(result.exitCode).not.toBe(0);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("deploy is not implemented");
    expect(result.stderr).toContain("forge deploy");
  }
});

for (const toolsAvailable of [false, true]) {
  test.each(
    [
      [],
      ["help"],
      ["--help"],
      ["-h"],
      ["deploy", "--help"],
      ["deploy", "-h"],
      ["help", "deploy"],
    ].map((args) => ({ args })),
  )(
    `help %j describes the initial workflow without configuration or tool calls (tools available: ${toolsAvailable})`,
    async ({ args }) => {
      const result = await invoke(args, toolsAvailable);
      expect(result.exitCode).toBe(0);
      expect(result.stderr).toBe("");
      expect(result.stdout).toContain("Usage: fence-rider");
      expect(result.stdout).toContain("deploy");
      expect(result.stdout).toContain("not implemented");
      expect(result.stdout).toContain("SecretSpec CLI");
      expect(result.stdout).toContain("Forge CLI");
      expect(result.stdout).toContain("PATH");
      expect(result.stdout).toContain("install");
      expect(result.stdout).toContain("tunnel");
    },
  );
}
