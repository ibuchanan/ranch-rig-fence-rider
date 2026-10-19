import {
  CommandFailure,
  checkInterruption,
  checkManifest,
  configure,
  run,
  workflowInterruption,
} from "./configured";

function helpRequested(args: string[]) {
  const pending = [...args];
  while (pending.length) {
    const arg = pending.shift();
    if (arg === "--approve") pending.shift();
    if (["--", "--help", "-h"].includes(arg as string)) return arg !== "--";
  }
  return false;
}

function reportFailure(
  error: unknown,
  state: { stage: string; signal: AbortSignal },
) {
  const detail = error instanceof CommandFailure ? `: ${error.message}` : "";
  console.error(
    `Fence Rider: ${state.stage} failed${detail}. No further commands were run.`,
  );
  if (state.signal.aborted) return state.signal.reason === "SIGINT" ? 130 : 143;
  return delegatedFailureStatus(error, state.stage);
}

function delegatedFailureStatus(error: unknown, stage: string) {
  return stage === "lint" && error instanceof CommandFailure
    ? error.exitCode
    : 1;
}

/** Run configured Forge lint with inherited input and unredacted live output. */
export async function lint(args: string[]): Promise<number> {
  if (helpRequested(args)) {
    console.log(
      "Usage: fence-rider lint [Forge options]\nResolve the whole active profile, check optional manifest metadata, then lint.\nForge stdin is inherited; stdout/stderr stream live and unredacted. Upstream output may expose values.\nNo target flags are injected and no runtime variables are uploaded.\nSecretSpec and Forge must be installed on PATH and authenticated separately.",
    );
    return 0;
  }
  const interruption = workflowInterruption();
  const state = { stage: "configuration", signal: interruption.signal };
  try {
    const { forge, env, config, properties } = await configure(state);
    await checkManifest(config, properties, state);
    state.stage = "lint";
    await run(forge, ["lint", ...args], state.signal, env, true);
    checkInterruption(state.signal);
    return 0;
  } catch (error) {
    return reportFailure(error, state);
  } finally {
    interruption.dispose();
  }
}
