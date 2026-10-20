export type Interruption = {
  signal: AbortSignal;
  dispose(): void;
};

/** Install operator signal handlers for one configured workflow; dispose after cleanup. */
export function workflowInterruption(): Interruption {
  const controller = new AbortController();
  const onInterrupt = () => controller.abort("SIGINT");
  const onTerminate = () => controller.abort("SIGTERM");
  process.on("SIGINT", onInterrupt);
  process.on("SIGTERM", onTerminate);
  return {
    signal: controller.signal,
    dispose() {
      process.removeListener("SIGINT", onInterrupt);
      process.removeListener("SIGTERM", onTerminate);
    },
  };
}

export class CommandFailure extends Error {
  constructor(
    message: string,
    readonly exitCode = 1,
  ) {
    super(message);
  }
}

/** Failure of a command delegated to Forge; its exit code is propagated to the operator. */
export class DelegatedFailure extends CommandFailure {}

/** The one mapping from an interruption signal to its conventional exit status. */
export function signalExitCode(reason: unknown) {
  return reason === "SIGINT" ? 130 : 143;
}

export function checkInterruption(signal: AbortSignal) {
  if (signal.aborted)
    throw new CommandFailure(
      `interrupted by ${signal.reason}`,
      signalExitCode(signal.reason),
    );
}

/** Run a helper with private stdio and return its stdout. */
export function capture(
  tool: string,
  args: string[],
  signal: AbortSignal,
  env = process.env,
) {
  return supervise(tool, args, signal, env, false);
}

/** Run a user-facing command with unredacted stdio inherited from the operator. */
export async function passthrough(
  tool: string,
  args: string[],
  signal: AbortSignal,
  env = process.env,
) {
  try {
    await supervise(tool, args, signal, env, true);
  } catch (error) {
    if (error instanceof CommandFailure)
      throw new DelegatedFailure(error.message, error.exitCode);
    throw error;
  }
}

type Child = Bun.Subprocess<
  "ignore" | "inherit",
  "pipe" | "inherit",
  "ignore" | "inherit"
>;

/** Launch with detached process group; `failed.launch` records an asynchronous launch error. */
function launch(
  tool: string,
  args: string[],
  env: typeof process.env,
  inherit: boolean,
  failed: { launch: boolean },
): Child {
  const options = {
    env,
    detached: process.platform !== "win32",
    onExit(
      _child: unknown,
      _code: unknown,
      _signal: unknown,
      error: Error | undefined,
    ) {
      failed.launch = error !== undefined;
    },
  };
  try {
    return inherit
      ? Bun.spawn([tool, ...args], {
          ...options,
          stdin: "inherit",
          stdout: "inherit",
          stderr: "inherit",
        })
      : Bun.spawn([tool, ...args], {
          ...options,
          stdin: "ignore",
          stdout: "pipe",
          stderr: "ignore",
        });
  } catch {
    throw new CommandFailure(
      "unable to launch executable; check installation and its interpreter",
    );
  }
}

/** Forward interruption to the child's process group, escalating to SIGKILL; returns cleanup. */
function forwardInterruption(child: Child, signal: AbortSignal) {
  let escalation: ReturnType<typeof setTimeout> | undefined;
  const terminate = (kind: NodeJS.Signals) => {
    try {
      if (process.platform === "win32") child.kill(kind);
      else process.kill(-child.pid, kind);
    } catch {
      // The process may have exited before the signal was delivered.
    }
  };
  const interrupt = () => {
    terminate(signal.reason);
    escalation ??= setTimeout(() => terminate("SIGKILL"), 1_000);
  };
  signal.addEventListener("abort", interrupt, { once: true });
  return async () => {
    // A helper can exit on interruption while its descendants keep running.
    if (signal.aborted) terminate("SIGKILL");
    signal.removeEventListener("abort", interrupt);
    clearTimeout(escalation);
    await child.exited;
  };
}

function checkExit(child: Child, code: number, launchError: boolean) {
  if (launchError)
    throw new CommandFailure("executable failed to start; check installation");
  if (child.signalCode !== null)
    throw new CommandFailure(`terminated by ${child.signalCode}`);
  if (code !== 0) throw new CommandFailure(`exit status ${code}`, code);
}

/** Shared supervision core: launch, group-kill on interruption, and classify exit. */
async function supervise(
  tool: string,
  args: string[],
  signal: AbortSignal,
  env: typeof process.env,
  inherit: boolean,
) {
  checkInterruption(signal);
  const failed = { launch: false };
  const child = launch(tool, args, env, inherit, failed);
  const cleanup = forwardInterruption(child, signal);
  try {
    const [code, stdout] = await Promise.all([
      child.exited,
      child.stdout instanceof ReadableStream
        ? new Response(child.stdout).text()
        : "",
    ]);
    checkInterruption(signal);
    checkExit(child, code, failed.launch);
    return stdout;
  } finally {
    await cleanup();
  }
}
