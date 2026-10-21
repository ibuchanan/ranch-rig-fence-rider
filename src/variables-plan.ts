import { isLocalControl, isOptionValue } from "./policy";

export type Upload = { key: string; args: string[] };

function validateRuntime(names: string[], values: Record<string, string>) {
  for (const key of names) {
    if (isLocalControl(key))
      throw new Error("Local control cannot be uploaded");
    const value = values[key];
    if (value !== undefined && !isOptionValue(value))
      throw new Error("Unsupported Forge positional value");
  }
}

/**
 * Decide the exact Forge arguments that encrypt each runtime value, in
 * declaration order, without touching any tool.
 */
export function planUploads(input: {
  target: string;
  runtime: string[];
  values: Record<string, string>;
}): Upload[] {
  validateRuntime(input.runtime, input.values);
  return input.runtime.flatMap((key) => {
    const value = input.values[key];
    return value === undefined
      ? []
      : [
          {
            key,
            args: [
              "variables",
              "set",
              "--encrypt",
              "--environment",
              input.target,
              key,
              value,
            ],
          },
        ];
  });
}
