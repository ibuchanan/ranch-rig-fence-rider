import { expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { processRunning, useBuiltCli, waitUntil } from "./support/cli.ts";
import { runWorkflow } from "./support/fixtures.ts";

useBuiltCli();

test.skipIf(process.platform === "win32").each([
  { blockStage: "schema", signal: "SIGINT", ignoreSignal: false },
  { blockStage: "export", signal: "SIGTERM", ignoreSignal: false },
  { blockStage: "variables", signal: "SIGINT", ignoreSignal: false },
  { blockStage: "variables", signal: "SIGTERM", ignoreSignal: false },
  { blockStage: "variables", signal: "SIGTERM", ignoreSignal: true },
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
    expect(result.stdout).not.toContain("Uploaded");
    if (blockStage === "variables")
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
      blockStage: "variables",
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
