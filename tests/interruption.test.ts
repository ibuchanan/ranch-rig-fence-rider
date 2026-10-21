import { expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { processRunning, useBuiltCli, waitUntil } from "./support/cli.ts";
import { runInstallation, runWorkflow } from "./support/fixtures.ts";

useBuiltCli();

test.skipIf(process.platform === "win32").each([
  { blockStage: "schema", signal: "SIGINT", ignoreSignal: false },
  { blockStage: "export", signal: "SIGTERM", ignoreSignal: false },
  { blockStage: "variables", signal: "SIGINT", ignoreSignal: false },
  { blockStage: "deploy", signal: "SIGINT", ignoreSignal: false },
  { blockStage: "deploy", signal: "SIGTERM", ignoreSignal: false },
  { blockStage: "deploy", signal: "SIGTERM", ignoreSignal: true },
] as const)(
  "operator interruption $signal during $blockStage cleans up (ignores signal: $ignoreSignal)",
  async ({ blockStage, signal, ignoreSignal }) => {
    const result = await runWorkflow({
      blockStage,
      ignoreSignal,
      args: ["-e", "production"],
      onSpawn: async (child, project) => {
        await waitUntil(
          () => existsSync(join(project, "ready")),
          "active helper readiness",
        );
        const pid = Number(await Bun.file(join(project, "ready")).text());
        child.kill(signal);
        await waitUntil(
          () => child.exitCode !== null || child.signalCode !== null,
          "Fence Rider exit",
        );
        await waitUntil(() => !processRunning(pid), "delegated helper exit");
        expect(await Bun.file(join(project, "received-signal")).text()).toBe(
          signal,
        );
      },
    });
    expect(result.exitCode).toBe(signal === "SIGINT" ? 130 : 143);
    expect(result.stderr).toContain(`interrupted by ${signal}`);
    expect(result.stderr).toContain("target production");
    expect(result.interactions.at(-1)?.args[0]).toBe(blockStage);
    expect(result.stdout).not.toContain("Deployment completed");
    if (["variables", "deploy"].includes(blockStage))
      expect(result.stderr).toContain(
        "Remote variables may already have changed",
      );
  },
  12_000,
);

test.skipIf(process.platform === "win32")(
  "interruption cleans up descendants even when the active helper exits first",
  async () => {
    const result = await runWorkflow({
      blockStage: "deploy",
      spawnDescendant: true,
      onSpawn: async (child, project) => {
        await waitUntil(
          () =>
            existsSync(join(project, "ready")) &&
            existsSync(join(project, "descendant-ready")),
          "process group readiness",
        );
        const parent = Number(await Bun.file(join(project, "ready")).text());
        const descendant = Number(
          await Bun.file(join(project, "descendant-ready")).text(),
        );
        child.kill("SIGTERM");
        await waitUntil(
          () => !processRunning(parent) && !processRunning(descendant),
          "entire delegated process group exit",
        );
        await waitUntil(() => child.exitCode !== null, "Fence Rider exit");
      },
    });
    expect(result.exitCode).toBe(143);
    expect(result.stderr).toContain("interrupted by SIGTERM");
  },
  12_000,
);

test.skipIf(process.platform === "win32").each([
  {
    blockStage: "check",
    signal: "SIGINT",
    ignoreSignal: false,
    spawnDescendant: false,
  },
  {
    blockStage: "check",
    signal: "SIGTERM",
    ignoreSignal: false,
    spawnDescendant: false,
  },
  {
    blockStage: "lint",
    signal: "SIGINT",
    ignoreSignal: false,
    spawnDescendant: true,
  },
  {
    blockStage: "lint",
    signal: "SIGTERM",
    ignoreSignal: true,
    spawnDescendant: true,
  },
] as const)(
  "configured lint interruption $signal at $blockStage cleans up the active process group",
  async ({ blockStage, signal, ignoreSignal, spawnDescendant }) => {
    const result = await runWorkflow({
      command: "lint",
      blockStage,
      ignoreSignal,
      spawnDescendant,
      onSpawn: async (child, project) => {
        await waitUntil(
          () =>
            existsSync(join(project, "ready")) &&
            (!spawnDescendant || existsSync(join(project, "descendant-ready"))),
          "lint process readiness",
        );
        const pid = Number(await Bun.file(join(project, "ready")).text());
        const descendant = spawnDescendant
          ? Number(await Bun.file(join(project, "descendant-ready")).text())
          : undefined;
        child.kill(signal);
        await waitUntil(
          () => child.exitCode !== null || child.signalCode !== null,
          "interrupted wrapper exit",
        );
        await waitUntil(
          () =>
            !processRunning(pid) &&
            (descendant === undefined || !processRunning(descendant)),
          "lint process group cleanup",
        );
        expect(await Bun.file(join(project, "received-signal")).text()).toBe(
          signal,
        );
      },
    });
    expect(result.exitCode).toBe(signal === "SIGINT" ? 130 : 143);
    expect(result.stderr).toContain(`interrupted by ${signal}`);
    expect(result.interactions.at(-1)?.args[0]).toBe(blockStage);
    expect(result.stderr).not.toContain(
      "Remote variables may already have changed",
    );
  },
  12_000,
);

test
  .skipIf(process.platform === "win32")
  .each(
    (["install", "uninstall"] as const).flatMap((command) =>
      (["SIGINT", "SIGTERM"] as const).map((signal) => ({ command, signal })),
    ),
  )(
  "configured $command interruption $signal cleans ignoring helpers and descendants",
  async ({ command, signal }) => {
    const result = await runInstallation({
      command,
      blockStage: command,
      ignoreSignal: true,
      spawnDescendant: true,
      onSpawn: async (child, project) => {
        await waitUntil(
          () =>
            existsSync(join(project, "ready")) &&
            existsSync(join(project, "descendant-ready")),
          "installation readiness",
        );
        const pid = Number(await Bun.file(join(project, "ready")).text());
        const descendant = Number(
          await Bun.file(join(project, "descendant-ready")).text(),
        );
        child.kill(signal);
        await waitUntil(
          () =>
            child.exitCode !== null &&
            !processRunning(pid) &&
            !processRunning(descendant),
          "installation process group cleanup",
        );
        expect(await Bun.file(join(project, "received-signal")).text()).toBe(
          signal,
        );
      },
    });
    expect(result.exitCode).toBe(signal === "SIGINT" ? 130 : 143);
    expect(result.stderr).toContain(`interrupted by ${signal}`);
    expect(
      result.interactions
        .filter(({ tool }) => tool === "forge")
        .map(({ args }) => args[0]),
    ).toEqual([command]);
  },
  12_000,
);

test.skipIf(process.platform === "win32").each([
  { blockStage: "schema", signal: "SIGINT", ignoreSignal: false },
  { blockStage: "export", signal: "SIGTERM", ignoreSignal: true },
  { blockStage: "tunnel", signal: "SIGINT", ignoreSignal: false },
  { blockStage: "tunnel", signal: "SIGINT", ignoreSignal: true },
  { blockStage: "tunnel", signal: "SIGTERM", ignoreSignal: true },
] as const)(
  "configured tunnel interruption $signal at $blockStage cleans descendants (ignores: $ignoreSignal)",
  async ({ blockStage, signal, ignoreSignal }) => {
    const result = await runWorkflow({
      command: "tunnel",
      args: ["-edevelopment"],
      blockStage,
      ignoreSignal,
      spawnDescendant: true,
      onSpawn: async (child, project) => {
        await waitUntil(
          () =>
            existsSync(join(project, "ready")) &&
            existsSync(join(project, "descendant-ready")),
          "tunnel group readiness",
        );
        const pid = Number(await Bun.file(join(project, "ready")).text());
        const descendant = Number(
          await Bun.file(join(project, "descendant-ready")).text(),
        );
        child.kill(signal);
        await waitUntil(
          () => child.exitCode !== null,
          "interrupted tunnel wrapper exit",
        );
        await waitUntil(
          () => !processRunning(pid) && !processRunning(descendant),
          "tunnel group cleanup",
        );
        expect(await Bun.file(join(project, "received-signal")).text()).toBe(
          signal,
        );
      },
    });
    expect(result.exitCode).toBe(signal === "SIGINT" ? 130 : 143);
    expect(result.stderr).toContain(`interrupted by ${signal}`);
    expect(result.interactions.at(-1)?.args[0]).toBe(blockStage);
  },
  12_000,
);
