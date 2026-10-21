/** Where a command writes: stdout for results, stderr for refusals and failures. */
export type Io = {
  out(text: string): void;
  err(text: string): void;
};

export const consoleIo: Io = {
  out: (text) => console.log(text),
  err: (text) => console.error(text),
};
