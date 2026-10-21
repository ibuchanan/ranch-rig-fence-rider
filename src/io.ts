import { capture } from "./process";

/** Everything a command touches outside its own process: output, environment, PATH, files and helper tools. */
export type Io = {
  /** Results go to stdout. */
  out(text: string): void;
  /** Refusals and failures go to stderr. */
  err(text: string): void;
  env: NodeJS.ProcessEnv;
  /** The path of an executable on PATH, or null when it is missing. */
  which(tool: string): string | null;
  /** A text file, relative to the working directory. */
  readFile(path: string): Promise<string>;
  /** Run a helper with private stdio and return its stdout; `env` defaults to the ambient one. */
  capture(
    tool: string,
    args: string[],
    signal: AbortSignal,
    env?: NodeJS.ProcessEnv,
  ): Promise<string>;
};

export const consoleIo: Io = {
  out: (text) => console.log(text),
  err: (text) => console.error(text),
  env: process.env,
  which: (tool) => Bun.which(tool),
  readFile: (path) => Bun.file(path).text(),
  capture,
};
