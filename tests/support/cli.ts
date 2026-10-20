import { afterAll, beforeAll, expect } from "bun:test";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export const root = fileURLToPath(new URL("../../", import.meta.url));

// Each test file gets its own workspace and compiled CLI so files can run in
// parallel worker processes without sharing a cwd or any other mutable state.
export const cli = { workspace: "", executable: "" };

export function useBuiltCli() {
  beforeAll(async () => {
    cli.workspace = mkdtempSync(join(root, "tmp_rovo_cli-"));
    cli.executable = join(cli.workspace, "fence-rider");
    const build = Bun.spawn(
      [
        process.execPath,
        "build",
        "--compile",
        join(root, "src/index.ts"),
        "--outfile",
        cli.executable,
      ],
      { cwd: cli.workspace, stdout: "pipe", stderr: "pipe" },
    );
    const [exitCode, stdout, stderr] = await Promise.all([
      build.exited,
      new Response(build.stdout).text(),
      new Response(build.stderr).text(),
    ]);
    expect({ exitCode, stderr: exitCode === 0 ? "" : stdout + stderr }).toEqual(
      {
        exitCode: 0,
        stderr: "",
      },
    );
  }, 60_000);

  afterAll(() => rmSync(cli.workspace, { recursive: true, force: true }));
}

export async function runCli(args: readonly string[], toolsAvailable = false) {
  const project = mkdtempSync(join(cli.workspace, "project-"));
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
  const child = Bun.spawn([cli.executable, ...args], {
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

export async function waitUntil(check: () => boolean, description: string) {
  const deadline = Date.now() + 15_000;
  while (!check()) {
    if (Date.now() >= deadline)
      throw new Error(`Timed out waiting for ${description}`);
    await Bun.sleep(10);
  }
}

export function processRunning(pid: number) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
