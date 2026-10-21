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
    /** The helper's stderr; for matching only, never to be printed. */
    readonly diagnostic = "",
    /** The helper's stdout, for a report it prints while failing; never to be printed. */
    readonly output = "",
  ) {
    super(message);
  }
}

/** The one mapping from an interruption signal to its conventional exit status. */
export function signalExitCode(reason: unknown) {
  return reason === "SIGINT" ? 130 : 143;
}

function checkInterruption(signal: AbortSignal) {
  if (signal.aborted)
    throw new CommandFailure(
      `interrupted by ${signal.reason}`,
      signalExitCode(signal.reason),
    );
}

type Child = Bun.Subprocess<"ignore", "pipe", "pipe">;

/** Launch with detached process group; `failed.launch` records an asynchronous launch error. */
function launch(
  tool: string,
  args: string[],
  env: typeof process.env,
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
    return Bun.spawn([tool, ...args], {
      ...options,
      stdin: "ignore",
      stdout: "pipe",
      stderr: "pipe",
    });
  } catch {
    throw new CommandFailure(
      "unable to launch executable; check installation and its interpreter",
    );
  }
}

/** Forward interruption to the child's process group, escalating to SIGKILL; returns cleanup. */
function forwardInterruption(
  child: Child,
  signal: AbortSignal,
  escalationMs: number,
) {
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
    escalation ??= setTimeout(() => terminate("SIGKILL"), escalationMs);
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

function checkExit(
  child: Child,
  code: number,
  launchError: boolean,
  diagnostic: string,
  output: string,
) {
  if (launchError)
    throw new CommandFailure("executable failed to start; check installation");
  if (child.signalCode !== null)
    throw new CommandFailure(`terminated by ${child.signalCode}`);
  if (code !== 0)
    throw new CommandFailure(`exit status ${code}`, code, diagnostic, output);
}

/** Run a helper with private stdio and return its stdout; group-kill on interruption and classify exit. */
export async function capture(
  tool: string,
  args: string[],
  signal: AbortSignal,
  env = process.env,
  /** How long a helper may ignore an interruption before SIGKILL. */
  escalationMs = 1_000,
) {
  checkInterruption(signal);
  const failed = { launch: false };
  const child = launch(tool, args, env, failed);
  const cleanup = forwardInterruption(child, signal, escalationMs);
  try {
    const [code, stdout, diagnostic] = await Promise.all([
      child.exited,
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
    ]);
    checkInterruption(signal);
    checkExit(child, code, failed.launch, diagnostic, stdout);
    return stdout;
  } finally {
    await cleanup();
  }
}
