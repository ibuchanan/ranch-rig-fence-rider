import { expect } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { cli, root } from "./cli.ts";
import { prepareProject } from "./fixtures.ts";

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
      scripts: { "forge:lint": "fence-rider lint" },
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

export const secretSpecAssets = process.env["SECRETSPEC_TEST_ASSETS"];

export async function setupConsumer(project: string) {
  const server = Bun.serve({
    port: 0,
    fetch(request) {
      const name = new URL(request.url).pathname.slice(1);
      if (!/^secretspec-(installer\.sh|[a-z0-9_-]+\.tar\.xz)$/.test(name))
        return new Response(null, { status: 404 });
      return new Response(Bun.file(join(secretSpecAssets ?? "", name)));
    },
  });
  try {
    const child = Bun.spawn(
      [join(project, "node_modules/.bin/fence-rider"), "setup"],
      {
        cwd: project,
        env: {
          PATH: `${process.execPath.slice(0, process.execPath.lastIndexOf("/"))}:/sbin:/usr/bin:/bin`,
          HOME: project,
          SECRETSPEC_INSTALLER_URL: `${server.url}secretspec-installer.sh`,
          INSTALLER_DOWNLOAD_URL: server.url.href.replace(/\/$/, ""),
        },
        stdout: "pipe",
        stderr: "pipe",
      },
    );
    const [status, stdout, stderr] = await Promise.all([
      child.exited,
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
    ]);
    expect({ status, diagnostic: status ? stdout + stderr : "" }).toEqual({
      status: 0,
      diagnostic: "",
    });
  } finally {
    server.stop(true);
  }
}
