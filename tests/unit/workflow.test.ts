import { expect, test } from "bun:test";
import { CommandFailure } from "../../src/process";
import { runWorkflow } from "../../src/workflow";
import { recordingIo } from "../support/main.ts";

test("a successful workflow exits 0 and reports nothing", async () => {
  const { io, stderr } = recordingIo();
  expect(await runWorkflow(async () => {}, io)).toBe(0);
  expect(stderr()).toBe("");
});

test("a failure reports the stage and exits 1", async () => {
  const { io, stderr } = recordingIo();
  const status = await runWorkflow(async (workflow) => {
    workflow.stage = "manifest validation";
    throw new Error("boom");
  }, io);
  expect(status).toBe(1);
  expect(stderr()).toBe(
    "Fence Rider: manifest validation failed. No further commands were run.\n",
  );
});

test("a command failure reports its message but never propagates its exit code", async () => {
  const { io, stderr } = recordingIo();
  const status = await runWorkflow(async (workflow) => {
    workflow.stage = "encrypted upload for SHARED";
    throw new CommandFailure("exit status 7", 7);
  }, io);
  expect(status).toBe(1);
  expect(stderr()).toBe(
    "Fence Rider: encrypted upload for SHARED failed: exit status 7. No further commands were run.\n",
  );
});

test.each([
  ["SIGINT", 130],
  ["SIGTERM", 143],
])(
  "%s during a workflow exits %i and removes its handlers",
  async (name, code) => {
    const before = process.listenerCount(name as NodeJS.Signals);
    const status = await runWorkflow(async (workflow) => {
      process.emit(name as NodeJS.Signals, name as NodeJS.Signals);
      expect(workflow.signal.aborted).toBe(true);
      throw new CommandFailure("terminated", 1);
    }, recordingIo().io);
    expect(status).toBe(code);
    expect(process.listenerCount(name as NodeJS.Signals)).toBe(before);
  },
);

test("handlers are removed after a failure", async () => {
  const before = process.listenerCount("SIGINT");
  await runWorkflow(async () => {
    throw new Error("x");
  }, recordingIo().io);
  expect(process.listenerCount("SIGINT")).toBe(before);
});

test("a failure names the target held on the context", async () => {
  const { io, stderr } = recordingIo();
  const status = await runWorkflow(async (workflow) => {
    workflow.target = "staging";
    workflow.stage = "manifest validation";
    throw new Error("boom");
  }, io);
  expect(status).toBe(1);
  expect(stderr()).toBe(
    "Fence Rider: manifest validation (target staging) failed. No further commands were run.\n",
  );
});

test("a failure after an upload attempt warns that remote variables may have changed", async () => {
  const { io, stderr } = recordingIo();
  await runWorkflow(async (workflow) => {
    workflow.target = "staging";
    workflow.uploadAttempted = true;
    workflow.stage = "encrypted upload for SHARED";
    throw new CommandFailure("exit status 3", 3);
  }, io);
  expect(stderr()).toBe(
    "Fence Rider: encrypted upload for SHARED (target staging) failed: exit status 3. No further commands were run. Remote variables may already have changed; no rollback was attempted.\n",
  );
});

test("a failure without an upload attempt carries no rollback warning", async () => {
  const { io, stderr } = recordingIo();
  await runWorkflow(async (workflow) => {
    workflow.target = "staging";
    throw new Error("x");
  }, io);
  expect(stderr()).not.toContain("Remote variables");
});
