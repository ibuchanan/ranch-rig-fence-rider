import {
  CommandFailure,
  DelegatedFailure,
  signalExitCode,
  workflowInterruption,
} from "./process";

/** Per-run context: the interruption signal and a display-only stage label. */
export type Workflow = { stage: string; signal: AbortSignal };

/** Run one configured workflow: own signals, disposal, failure report and exit status. */
export async function runWorkflow(
  body: (workflow: Workflow) => Promise<void>,
): Promise<number> {
  const interruption = workflowInterruption();
  const workflow: Workflow = {
    stage: "configuration",
    signal: interruption.signal,
  };
  try {
    await body(workflow);
    return 0;
  } catch (error) {
    const detail = error instanceof CommandFailure ? `: ${error.message}` : "";
    console.error(
      `Fence Rider: ${workflow.stage} failed${detail}. No further commands were run.`,
    );
    if (workflow.signal.aborted) return signalExitCode(workflow.signal.reason);
    return error instanceof DelegatedFailure ? error.exitCode : 1;
  } finally {
    interruption.dispose();
  }
}
