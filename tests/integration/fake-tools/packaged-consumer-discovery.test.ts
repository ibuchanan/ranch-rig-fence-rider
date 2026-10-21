import { expect, test } from "bun:test";
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { root, useBuiltCli } from "../../support/cli.ts";
import { once, packedConsumer } from "../../support/consumer.ts";
import { deploymentEnv } from "../../support/fixtures.ts";

useBuiltCli();

const discoveryConsumer = once(packedConsumer);

test.each([[[]], [["--help"]], [["--version"]], [["unsupported"]]])(
  "installed package exposes discovery %j without tools or configuration",
  async (args) => {
    const project = await discoveryConsumer();
    const bin = join(project, "node_modules", ".bin", "fence-rider");
    expect(existsSync(bin)).toBe(true);
    const { version } = await Bun.file(join(root, "package.json")).json();
    const child = Bun.spawn([bin, ...args], {
      cwd: project,
      env: {
        PATH: process.execPath.slice(0, process.execPath.lastIndexOf("/")),
        HOME: project,
      },
      stdout: "pipe",
      stderr: "pipe",
    });
    const [status, stdout, stderr] = await Promise.all([
      child.exited,
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
    ]);
    expect(status).toBe(args[0] === "unsupported" ? 1 : 0);
    expect(stdout + stderr).toContain(
      args[0] === "--version"
        ? `fence-rider ${version}`
        : args[0] === "unsupported"
          ? "Unknown command"
          : "Usage: fence-rider",
    );
  },
);

test("installed lint script stops with the shell's not-found status when SecretSpec is missing", async () => {
  const project = await packedConsumer();
  rmSync(join(project, "bin/secretspec"));
  const child = Bun.spawn([process.execPath, "run", "forge:lint"], {
    cwd: project,
    env: {
      ...deploymentEnv(project, {}),
      PATH: `${join(project, "bin")}:${process.execPath.slice(0, process.execPath.lastIndexOf("/"))}`,
    },
    stdout: "pipe",
    stderr: "pipe",
  });
  const [status, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  expect(status).toBe(127);
  expect(stdout + stderr).toContain("secretspec");
  expect(existsSync(join(project, "tool-calls"))).toBe(false);
});
