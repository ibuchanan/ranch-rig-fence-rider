import { afterEach, expect, spyOn, test } from "bun:test";
import { CommandFailure, DelegatedFailure } from "../src/process";
import { runWorkflow } from "../src/workflow";

const errors = spyOn(console, "error").mockImplementation(() => {});

afterEach(() => errors.mockClear());

test("a successful workflow exits 0 and reports nothing", async () => {
  expect(await runWorkflow(async () => {})).toBe(0);
  expect(errors).not.toHaveBeenCalled();
});

test("a failure reports the stage and exits 1", async () => {
  const status = await runWorkflow(async (workflow) => {
    workflow.stage = "manifest validation";
    throw new Error("boom");
  });
  expect(status).toBe(1);
  expect(errors).toHaveBeenCalledWith(
    "Fence Rider: manifest validation failed. No further commands were run.",
  );
});

test("a delegated failure propagates its exit code whatever the stage says", async () => {
  const status = await runWorkflow(async (workflow) => {
    workflow.stage = "something unrelated to the command";
    throw new DelegatedFailure("exit status 7", 7);
  });
  expect(status).toBe(7);
  expect(errors).toHaveBeenCalledWith(
    "Fence Rider: something unrelated to the command failed: exit status 7. No further commands were run.",
  );
});

test("a non-delegated command failure does not propagate its exit code", async () => {
  const status = await runWorkflow(async (workflow) => {
    workflow.stage = "lint";
    throw new CommandFailure("exit status 7", 7);
  });
  expect(status).toBe(1);
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
      throw new DelegatedFailure("terminated", 1);
    });
    expect(status).toBe(code);
    expect(process.listenerCount(name as NodeJS.Signals)).toBe(before);
  },
);

test("handlers are removed after a failure", async () => {
  const before = process.listenerCount("SIGINT");
  await runWorkflow(async () => {
    throw new Error("x");
  });
  expect(process.listenerCount("SIGINT")).toBe(before);
});

test("a failure names the target held on the context", async () => {
  const status = await runWorkflow(async (workflow) => {
    workflow.target = "staging";
    workflow.stage = "manifest validation";
    throw new Error("boom");
  });
  expect(status).toBe(1);
  expect(errors).toHaveBeenCalledWith(
    "Fence Rider: manifest validation (target staging) failed. No further commands were run.",
  );
});

test("a failure after an upload attempt warns that remote variables may have changed", async () => {
  await runWorkflow(async (workflow) => {
    workflow.target = "staging";
    workflow.uploadAttempted = true;
    workflow.stage = "deployment";
    throw new DelegatedFailure("exit status 3", 3);
  });
  expect(errors).toHaveBeenCalledWith(
    "Fence Rider: deployment (target staging) failed: exit status 3. No further commands were run. Remote variables may already have changed; no rollback was attempted.",
  );
});

test("a failure without an upload attempt carries no rollback warning", async () => {
  await runWorkflow(async (workflow) => {
    workflow.target = "staging";
    throw new Error("x");
  });
  expect(String(errors.mock.calls[0]?.[0])).not.toContain("Remote variables");
});
