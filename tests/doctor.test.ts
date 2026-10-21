import { expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { cli, useBuiltCli } from "./support/cli.ts";

useBuiltCli();

type Tools = Record<string, string | null>;

/** Run `doctor` with fake tools whose `--version` prints the given text (null: tool absent). */
async function runDoctor(tools: Tools, args: string[] = [], toml?: string) {
  const project = mkdtempSync(join(cli.workspace, "doctor-"));
  const bin = join(project, "bin");
  mkdirSync(bin);
  for (const [tool, output] of Object.entries(tools)) {
    if (output === null) continue;
    writeFileSync(join(bin, tool), `#!/bin/sh\necho "${output}"\n`, {
      mode: 0o755,
    });
  }
  if (toml !== undefined) writeFileSync(join(project, "secretspec.toml"), toml);
  const child = Bun.spawn([cli.executable, "doctor", ...args], {
    cwd: project,
    env: { PATH: bin, HOME: project, TMPDIR: project },
    stdout: "pipe",
    stderr: "pipe",
  });
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  return { exitCode, stdout, stderr };
}

test("doctor passes when both tools are within the tested range", async () => {
  const result = await runDoctor({
    secretspec: "secretspec 0.21.1",
    forge: "14.2.0",
  });
  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain("SecretSpec: 0.21.1 ok");
  expect(result.stdout).toContain("Forge CLI: 14.2.0 ok");
  expect(result.stdout).toContain("supported from 0.17.0, tested through");
});

test("doctor warns about newer versions without failing", async () => {
  const result = await runDoctor({
    secretspec: "secretspec 99.0.0",
    forge: "99.1",
  });
  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain("SecretSpec: 99.0.0 untested");
  expect(result.stdout).toContain("Forge CLI: 99.1 untested");
});

test("doctor fails for a version older than supported", async () => {
  const result = await runDoctor({
    secretspec: "secretspec 0.16.9",
    forge: "14.2.0",
  });
  expect(result.exitCode).toBe(1);
  expect(result.stdout).toContain("SecretSpec: 0.16.9 unsupported");
  expect(result.stdout).toContain("Forge CLI: 14.2.0 ok");
});

test("doctor fails for a missing tool and still reports the other", async () => {
  const result = await runDoctor({ secretspec: null, forge: "14.2.0" });
  expect(result.exitCode).toBe(1);
  expect(result.stdout).toContain("SecretSpec: not found on PATH");
  expect(result.stdout).toContain("Forge CLI: 14.2.0 ok");
});

test("doctor fails when a version cannot be read", async () => {
  const result = await runDoctor({
    secretspec: "secretspec dev build",
    forge: "14.2.0",
  });
  expect(result.exitCode).toBe(1);
  expect(result.stdout).toContain("SecretSpec: no version found unreadable");
});

test("doctor accepts no arguments", async () => {
  const result = await runDoctor({}, ["--verbose"]);
  expect(result.exitCode).toBe(1);
  expect(result.stderr).toContain("Unknown command or unsupported arguments");
});

const spec = (scopes: string) =>
  `[project]\nname = "x"\nrevision = "1.0"\n[profiles.default]\nA = { description = "a" }\n${scopes}`;
const ok = { secretspec: "secretspec 0.21.1", forge: "14.2.0" };

test("doctor skips the scope check without a SecretSpec file", async () => {
  const result = await runDoctor(ok);
  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain("scope check skipped");
});

test("doctor accepts the recognized scopes", async () => {
  const result = await runDoctor(
    ok,
    [],
    spec(
      '[scopes.manifest]\nsecrets = ["A"]\n[scopes.runtime]\nsecrets = ["A"]\n',
    ),
  );
  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain("scopes ok");
});

test("doctor warns about a scope Fence Rider never reads without failing", async () => {
  const result = await runDoctor(
    ok,
    [],
    spec('[scopes.runtim]\nsecrets = ["A"]\n'),
  );
  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain(
    'scope "runtim" is not read by Fence Rider (recognized: manifest, runtime)',
  );
});

test("doctor warns and skips the scope check when the file cannot be parsed", async () => {
  const result = await runDoctor(ok, [], "not valid TOML = [");
  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain("missing or unparsable; scope check skipped");
});
