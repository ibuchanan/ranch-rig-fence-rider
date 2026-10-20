const environmentName = /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/;

// Selectors fence-rider consumes locally; never uploaded or injected as runtime.
const localControls = [
  "FORGE_ENVIRONMENT",
  "FORGE_ENV",
  "FORGE_SITE",
  "FORGE_PRODUCT",
];

export function isEnvironmentName(value: string): boolean {
  return environmentName.test(value);
}

export function isLocalControl(key: string): boolean {
  return localControls.includes(key);
}
