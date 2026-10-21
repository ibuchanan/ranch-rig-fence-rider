import { expect, test } from "bun:test";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import {
  CommandFailure,
  capture,
  workflowInterruption,
} from "../../../src/process.ts";
import {
  makeScratchDir,
  processRunning,
  waitUntil,
} from "../../support/cli.ts";

// The supervisor is exercised directly with tiny shell children; the compiled
// CLI tests only need to show that its failures are reported safely.
const sh = (
  script: string,
  signal = new AbortController().signal,
  ms?: number,
) => capture("sh", ["-c", script], signal, process.env, ms);

async function failureOf(run: Promise<unknown>) {
  const error = await run.then(
    () => undefined,
    (reason: unknown) => reason,
  );
  expect(error).toBeInstanceOf(CommandFailure);
  return error as CommandFailure;
}

test("a helper that succeeds returns its stdout and nothing from stderr", async () => {
  expect(await sh("echo out; echo err >&2")).toBe("out\n");
});

test("output larger than a pipe buffer is read in full", async () => {
  const output = await sh("head -c 300000 /dev/zero | tr '\\0' x");
  expect(output).toHaveLength(300_000);
});

test("a non-zero exit carries its status and keeps stderr as a diagnostic only", async () => {
  const failure = await failureOf(sh("echo detail >&2; exit 7"));
  expect(failure.exitCode).toBe(7);
  expect(failure.message).toBe("exit status 7");
  expect(failure.message).not.toContain("detail");
  expect(failure.diagnostic).toBe("detail\n");
});

test("a helper killed by a signal cannot become success", async () => {
  const failure = await failureOf(sh("kill -TERM $$"));
  expect(failure.message).toBe("terminated by SIGTERM");
  expect(failure.exitCode).toBe(1);
});

test("a missing executable reports that it cannot launch", async () => {
  const failure = await failureOf(
    capture("fence-rider-no-such-tool", [], new AbortController().signal),
  );
  expect(failure.message).toContain("unable to launch");
});

test("a signal already received stops before launching anything", async () => {
  const dir = makeScratchDir("process-");
  try {
    const marker = join(dir, "launched");
    const controller = new AbortController();
    controller.abort("SIGINT");
    const failure = await failureOf(sh(`touch ${marker}`, controller.signal));
    expect(failure.message).toBe("interrupted by SIGINT");
    expect(failure.exitCode).toBe(130);
    expect(existsSync(marker)).toBe(false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test.skipIf(process.platform === "win32").each([
  { signal: "SIGINT", exitCode: 130 },
  { signal: "SIGTERM", exitCode: 143 },
] as const)(
  "$signal during a run stops the helper and reports exit $exitCode",
  async ({ signal, exitCode }) => {
    const dir = makeScratchDir("process-");
    try {
      const pidFile = join(dir, "pid");
      const controller = new AbortController();
      const run = failureOf(
        sh(`echo $$ > ${pidFile}; exec sleep 30`, controller.signal),
      );
      await waitUntil(() => existsSync(pidFile), "helper start");
      const pid = Number(readFileSync(pidFile, "utf8"));
      controller.abort(signal);
      const failure = await run;
      expect(failure.message).toBe(`interrupted by ${signal}`);
      expect(failure.exitCode).toBe(exitCode);
      expect(processRunning(pid)).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  },
);

test.skipIf(process.platform === "win32")(
  "a helper that ignores the interruption is killed after the grace period",
  async () => {
    const dir = makeScratchDir("process-");
    try {
      const pidFile = join(dir, "pid");
      const controller = new AbortController();
      const run = failureOf(
        sh(
          `trap '' TERM; echo $$ > ${pidFile}; while :; do sleep 0.05; done`,
          controller.signal,
          100,
        ),
      );
      await waitUntil(() => existsSync(pidFile), "helper start");
      const pid = Number(readFileSync(pidFile, "utf8"));
      controller.abort("SIGTERM");
      const failure = await run;
      expect(failure.exitCode).toBe(143);
      expect(processRunning(pid)).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  },
);

test.skipIf(process.platform === "win32")(
  "interruption also stops descendants when the helper exits first",
  async () => {
    const dir = makeScratchDir("process-");
    try {
      const pidFile = join(dir, "descendant");
      const controller = new AbortController();
      const run = failureOf(
        sh(
          `trap 'exit 0' TERM; (trap '' TERM; sleep 30 & echo $! > ${pidFile}; wait) & wait`,
          controller.signal,
          100,
        ),
      );
      await waitUntil(() => existsSync(pidFile), "descendant start");
      const pid = Number(readFileSync(pidFile, "utf8"));
      controller.abort("SIGTERM");
      await run;
      await waitUntil(() => !processRunning(pid), "descendant exit");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  },
);

test.skipIf(process.platform === "win32").each([
  { signal: "SIGINT", exitCode: 130 },
  { signal: "SIGTERM", exitCode: 143 },
] as const)(
  "the operator's $signal aborts the workflow signal until disposed",
  ({ signal }) => {
    const interruption = workflowInterruption();
    try {
      expect(interruption.signal.aborted).toBe(false);
      process.emit(signal);
      expect(interruption.signal.aborted).toBe(true);
      expect(interruption.signal.reason).toBe(signal);
    } finally {
      interruption.dispose();
    }
    expect(process.listenerCount(signal)).toBe(0);
  },
);
