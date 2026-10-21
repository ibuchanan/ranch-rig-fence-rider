import { expect, test } from "bun:test";
import { mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { cli, makeScratchDir, useBuiltCli } from "../../support/cli.ts";
import { realSecretSpec } from "../../support/fixtures.ts";

useBuiltCli();

const parent = `[project]
name = "parent"
revision = "1.0"

[profiles.default]
A = { description = "a" }
B = { description = "b" }

[scopes.manifest]
secrets = ["A", "B"]
`;

const child = `[project]
name = "child"
revision = "1.0"
extends = ["../parent"]
require_reason = false

[profiles.default]
`;

/** Run the built `doctor` against real SecretSpec, whose `manifest` scope exists only in the parent file. */
async function runDoctor(manifest: string | undefined, file: string) {
  const root = makeScratchDir("doctor-inherited-");
  const bin = join(root, "bin");
  const project = join(root, "child");
  mkdirSync(bin);
  mkdirSync(join(root, "parent"));
  mkdirSync(project);
  symlinkSync(realSecretSpec ?? "", join(bin, "secretspec"));
  writeFileSync(join(bin, "forge"), '#!/bin/sh\necho "14.2.0"\n', {
    mode: 0o755,
  });
  writeFileSync(join(root, "parent", "secretspec.toml"), parent);
  writeFileSync(join(project, "secretspec.toml"), file);
  writeFileSync(join(project, "values.env"), "A=1\nB=2\n");
  if (manifest !== undefined)
    writeFileSync(join(project, "manifest.yml"), manifest);
  const process = Bun.spawn([cli.executable, "doctor"], {
    cwd: project,
    env: {
      PATH: `${bin}:${dirname(realSecretSpec ?? "")}`,
      HOME: project,
      TMPDIR: project,
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
  "doctor fails for a manifest scope inherited from a parent file",
  async () => {
    const result = await runDoctor("environment:\n  variables: [A]\n", child);
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain(
      "Manifest: manifest declaration for B failed",
    );
  },
);

test.skipIf(!realSecretSpec)(
  "doctor passes for an inherited manifest scope that manifest.yml declares",
  async () => {
    const result = await runDoctor(
      "environment:\n  variables: [A, B]\n",
      child,
    );
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain(
      "Manifest: manifest scope members are declared in manifest.yml",
    );
  },
);
