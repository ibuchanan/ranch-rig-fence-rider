import {
  CommandFailure,
  DelegatedFailure,
  signalExitCode,
  workflowInterruption,
} from "./process";

/** Per-run context: interruption signal, display-only stage label and what the failure report needs. */
export type Workflow = {
  stage: string;
  signal: AbortSignal;
  /** Forge environment the run acts on, once known; shown in stage labels. */
  target?: string;
  /** Set once remote variables may have been changed, so failures warn of it. */
  uploadAttempted?: boolean;
};

/** The stage label as shown to the operator, qualified by the target when known. */
export function describeStage({ stage, target }: Workflow) {
  return target === undefined ? stage : `${stage} (target ${target})`;
}

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
    const warning = workflow.uploadAttempted
      ? " Remote variables may already have changed; no rollback was attempted."
      : "";
    console.error(
      `Fence Rider: ${describeStage(workflow)} failed${detail}. No further commands were run.${warning}`,
    );
    if (workflow.signal.aborted) return signalExitCode(workflow.signal.reason);
    return error instanceof DelegatedFailure ? error.exitCode : 1;
  } finally {
    interruption.dispose();
  }
}
