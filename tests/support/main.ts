import { main } from "../../src/cli";
import type { Io } from "../../src/io";

/** An Io that records what a command wrote instead of printing it. */
export function recordingIo() {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const io: Io = {
    out: (text) => void stdout.push(text),
    err: (text) => void stderr.push(text),
  };
  return {
    io,
    stdout: () => stdout.map((text) => `${text}\n`).join(""),
    stderr: () => stderr.map((text) => `${text}\n`).join(""),
  };
}

/** Run one invocation in-process: no compiled binary, no subprocess. */
export async function runMain(args: readonly string[]) {
  const recorded = recordingIo();
  const exitCode = await main([...args], recorded.io);
  return { exitCode, stdout: recorded.stdout(), stderr: recorded.stderr() };
}
