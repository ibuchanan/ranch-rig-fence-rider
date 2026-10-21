import { expect } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { cli, root } from "./cli.ts";
import { prepareProject } from "./fixtures.ts";

/** Build the packed consumer once per group of cases and share it between them. */
export function once<T>(build: () => Promise<T>): () => Promise<T> {
  let value: Promise<T> | undefined;
  return () => {
    value ??= build();
    return value;
  };
}

export async function packedConsumer() {
  const archive = join(cli.workspace, "fence-rider.tgz");
  const packed = Bun.spawnSync(
    [process.execPath, "pm", "pack", "--ignore-scripts", "--filename", archive],
    { cwd: root, stdout: "pipe", stderr: "pipe" },
  );
  expect(packed.exitCode, packed.stderr.toString()).toBe(0);
  const project = prepareProject({ command: "lint" });
  writeFileSync(
    join(project, "package.json"),
    JSON.stringify({
      private: true,
      scripts: { "forge:lint": 'cmd=$(fence-rider lint) && sh -c "$cmd" sh' },
    }),
  );
  const installed = Bun.spawnSync(
    [process.execPath, "add", "--dev", archive, "--ignore-scripts"],
    {
      cwd: project,
      env: { ...process.env, HOME: project },
      stdout: "pipe",
      stderr: "pipe",
    },
  );
  expect(installed.exitCode, installed.stderr.toString()).toBe(0);
  return project;
}
