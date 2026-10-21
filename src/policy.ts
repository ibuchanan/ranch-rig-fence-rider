// Selectors fence-rider consumes locally; never uploaded or injected as runtime.
export const localControls = [
  "FORGE_ENVIRONMENT",
  "FORGE_SITE",
  "FORGE_PRODUCT",
];

/** Forge validates target names; only reject values that would parse as an option. */
export function isOptionValue(value: string): boolean {
  return value !== "" && !value.startsWith("-");
}

export function isLocalControl(key: string): boolean {
  return localControls.includes(key);
}
