import { existsSync } from "node:fs";
import { join } from "node:path";

/** The ordinary synthetic secret every fixture uses unless a test asks for more. */
export const sharedValue = "synthetic shared FENCE_RIDER_SYNTHETIC_SECRET_06";

/**
 * A secret carrying quotes, a newline and shell syntax. Only the tests about
 * quoting, injection and leaks request it. It contains sharedValue, so the
 * leak guarantee catches either form.
 */
export const hostileValue = `${sharedValue} "quoted" 'value'\n$HOME; $(touch injected); \`id\``;

/**
 * The suite's two strongest guarantees as named assertions. Runners apply the
 * leak guarantees to every invocation; a test that proves "no tool was
 * called" says so itself by calling expectNoToolCalls.
 */

/** Guarantee: no secret value reaches stdout or stderr. */
export function expectNoSecretInOutput(
  invocation: string,
  output: { stdout: string; stderr: string },
) {
  const secretMarkers = [hostileValue, sharedValue];
  for (const [stream, text] of Object.entries(output)) {
    const leaked = secretMarkers.find((marker) => text.includes(marker));
    if (leaked !== undefined)
      throw new Error(
        `Secret-leak guarantee violated: ${invocation} printed a secret value on ${stream}: ${JSON.stringify(leaked)}`,
      );
  }
}

/** Guarantee: a secret value never becomes shell syntax that creates a stray file. */
export function expectNoInjectedFile(invocation: string, project: string) {
  if (existsSync(join(project, "injected")))
    throw new Error(
      `Injection guarantee violated: ${invocation} created the file "injected" in ${project}`,
    );
}

/** Guarantee: this invocation called neither SecretSpec nor Forge. */
export function expectNoToolCalls(
  invocation: string,
  calls: readonly { tool: string; args?: readonly string[] }[],
) {
  if (calls.length > 0)
    throw new Error(
      `No-tool-call guarantee violated: ${invocation} called ${calls
        .map((call) => [call.tool, ...(call.args ?? [])].join(" "))
        .join("; ")}`,
    );
}
