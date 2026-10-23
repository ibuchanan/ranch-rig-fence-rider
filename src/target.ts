import { isOptionValue } from "./policy";
import { UsageError } from "./usage-error";

/** Validate a target without echoing caller or provider values in diagnostics. */
export function validateTarget(target: string) {
  if (typeof target !== "string" || !isOptionValue(target))
    throw new UsageError(
      "Invalid Forge target: --environment (-e) or FORGE_ENVIRONMENT must be non-empty and not start with a dash",
    );
  return target;
}
