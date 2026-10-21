import { expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { cli, useBuiltCli } from "../../support/cli.ts";

// The checks themselves run in-process in tests/unit/doctor.test.ts. These run
// the compiled binary against real fake executables, so PATH lookup, spawning
// `--version` and the real `secretspec check` call are exercised once each.
useBuiltCli();

type Tools = Record<string, string | null>;

type Project = {
  /** Printed by a fake `secretspec check --json --scope manifest`; "fail" exits 1 as for an undefined scope. */
  report?: string[] | "fail" | "undefined";
  /** The manifest.yml in the project, when it has one. */
  manifest?: string;
};

const schemaScript = `if [ "$1" = schema ]; then echo '{"type":"object","properties":{"A":{"type":"string"}}}'; exit 0; fi\n`;

const checkScript = (report: Project["report"]) =>
  schemaScript +
  (report === "fail"
    ? 'if [ "$1" = check ]; then echo "Invalid scope" >&2; exit 1; fi\n'
    : report === undefined || report === "undefined"
      ? 'if [ "$1" = check ]; then echo "Scope \'manifest\' is not defined in secretspec.toml" >&2; exit 1; fi\n'
      : `if [ "$1" = check ]; then echo '${JSON.stringify({ schema_version: 1, scope: "manifest", secrets: report.map((name) => ({ name, status: "resolved" })) })}'; exit 0; fi\n`);

/** Run `doctor` with fake tools whose `--version` prints the given text (null: tool absent). */
async function runDoctor(
  tools: Tools,
  args: string[] = [],
  toml?: string,
  project: Project = {},
) {
  const dir = mkdtempSync(join(cli.workspace, "doctor-"));
  const bin = join(dir, "bin");
  mkdirSync(bin);
  for (const [tool, output] of Object.entries(tools)) {
    if (output === null) continue;
    const check = tool === "secretspec" ? checkScript(project.report) : "";
    writeFileSync(join(bin, tool), `#!/bin/sh\n${check}echo "${output}"\n`, {
      mode: 0o755,
    });
  }
  if (toml !== undefined) writeFileSync(join(dir, "secretspec.toml"), toml);
  if (project.manifest !== undefined)
    writeFileSync(join(dir, "manifest.yml"), project.manifest);
  const child = Bun.spawn([cli.executable, "doctor", ...args], {
    cwd: dir,
    env: { PATH: bin, HOME: dir, TMPDIR: dir },
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

const spec = (scopes: string) =>
  `[project]\nname = "x"\nrevision = "1.0"\n[profiles.default]\nA = { description = "a" }\n${scopes}`;
const ok = { secretspec: "secretspec 0.21.1", forge: "14.2.0" };

const manifestSpec = spec('[scopes.manifest]\nsecrets = ["A", "B"]\n');

test("doctor passes when every manifest scope member is declared in manifest.yml", async () => {
  const result = await runDoctor(ok, [], manifestSpec, {
    report: ["A", "B"],
    manifest:
      "environment:\n  variables:\n    - A\n    - key: B\n      default: x\n",
  });
  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain(
    "Manifest: manifest scope members are declared in manifest.yml",
  );
});
