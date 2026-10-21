import { expect, test } from "bun:test";
import { mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { cli, makeScratchDir, useBuiltCli } from "../../support/cli.ts";
import { realSecretSpec } from "../../support/fixtures.ts";

useBuiltCli();

const spec = `[project]
name = "x"
revision = "1.0"
require_reason = false

[profiles.default]
REQUIRED = { description = "r" }
OPTIONAL = { description = "o", required = false }
`;

/** Run the built `doctor` against real SecretSpec with the given dotenv values. */
async function runDoctor(values: string, args: string[]) {
  const root = makeScratchDir("doctor-resolve-");
  const bin = join(root, "bin");
  mkdirSync(bin);
  symlinkSync(realSecretSpec ?? "", join(bin, "secretspec"));
  writeFileSync(join(bin, "forge"), '#!/bin/sh\necho "14.2.0"\n', {
    mode: 0o755,
  });
  writeFileSync(join(root, "secretspec.toml"), spec);
  writeFileSync(join(root, "values.env"), values);
  const process = Bun.spawn([cli.executable, "doctor", ...args], {
    cwd: root,
    env: {
      PATH: `${bin}:${dirname(realSecretSpec ?? "")}`,
      HOME: root,
      TMPDIR: root,
      SECRETSPEC_PROVIDER: "dotenv:values.env",
    },
    stdout: "pipe",
    stderr: "pipe",
  });
  const [exitCode, stdout] = await Promise.all([
    process.exited,
    new Response(process.stdout).text(),
  ]);
  return { exitCode, stdout };
}

test.skipIf(!realSecretSpec)(
  "doctor --resolve passes when the required value resolves",
  async () => {
    const result = await runDoctor("REQUIRED=synthetic-secret\n", [
      "--resolve",
    ]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain(
      "Resolution: every required value resolves",
    );
    expect(result.stdout).not.toContain("synthetic-secret");
  },
);

test.skipIf(!realSecretSpec)(
  "doctor --resolve fails and names an unresolved required value",
  async () => {
    const result = await runDoctor("OPTIONAL=synthetic-secret\n", [
      "--resolve",
    ]);
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain(
      "Resolution: required values do not resolve: REQUIRED",
    );
    expect(result.stdout).not.toContain("synthetic-secret");
  },
);

test.skipIf(!realSecretSpec)("plain doctor does not resolve", async () => {
  const result = await runDoctor("", []);
  expect(result.exitCode).toBe(0);
  expect(result.stdout).not.toContain("Resolution:");
});
