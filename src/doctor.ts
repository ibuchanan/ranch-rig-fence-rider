import { resolve } from "node:path";
import { capture } from "./process";
import { recognizedScopes, unrecognizedScopes } from "./resolution";

/**
 * Lowest supported and highest tested release of each external tool. The floors
 * are inferred from the features Fence Rider uses (SecretSpec scopes arrived in
 * 0.17), not exercised; only the baseline it was built against is tested, so
 * widen `tested` as newer releases are verified.
 */
const dependencies = [
  {
    name: "SecretSpec",
    tool: "secretspec",
    lowest: "0.17.0",
    tested: "0.21.1",
  },
  { name: "Forge CLI", tool: "forge", lowest: "1.3.0", tested: "14.2.0" },
];

type Dependency = (typeof dependencies)[number];

export const doctorUsage = [
  "Usage: fence-rider doctor",
  "Report the SecretSpec and Forge CLI versions on PATH against the lowest supported and highest tested versions.",
  "Also checks the SecretSpec file (SECRETSPEC_FILE, else ./secretspec.toml) and warns about scopes Fence Rider never reads.",
  "Exits 1 when a tool is missing, unreadable or older than supported; a newer version or an unused scope is only a warning.",
  "Other commands never pre-check versions: a changed tool contract surfaces as that command's failure.",
].join("\n");

/** Order two dotted versions, treating a missing minor or patch as zero. */
const order = (a: string, b: string) =>
  Bun.semver.order(a.padEnd(5, ".0"), b.padEnd(5, ".0"));

/** Judge a version against the supported range; `failed` means doctor must exit 1. */
function assess({ lowest, tested }: Dependency, version: string) {
  if (order(version, lowest) < 0)
    return { status: "unsupported (too old)", failed: true };
  if (order(version, tested) > 0)
    return { status: "untested (newer than tested)", failed: false };
  return { status: "ok", failed: false };
}

/** The first dotted number in the tool's `--version` output, if it runs and prints one. */
async function detectVersion(path: string) {
  try {
    const output = await capture(
      path,
      ["--version"],
      new AbortController().signal,
    );
    return /\d+(?:\.\d+)+/.exec(output)?.[0];
  } catch {
    return undefined;
  }
}

async function inspect(dependency: Dependency) {
  const range = `supported from ${dependency.lowest}, tested through ${dependency.tested}`;
  const path = Bun.which(dependency.tool);
  if (!path)
    return {
      failed: true,
      line: `${dependency.name}: not found on PATH (${range}). Install it and authenticate separately.`,
    };
  const version = await detectVersion(path);
  if (!version)
    return {
      failed: true,
      line: `${dependency.name}: no version found unreadable (${range})`,
    };
  const { status, failed } = assess(dependency, version);
  return {
    failed,
    line: `${dependency.name}: ${version} ${status} (${range})`,
  };
}

const unusedScope = (name: string) =>
  `Configuration: scope "${name}" is not read by Fence Rider (recognized: ${recognizedScopes.join(", ")}); ignore this if another tool uses it`;

/** Names of the `[scopes.*]` tables in a SecretSpec file; undefined when it is missing or unparsable. */
async function declaredScopes(file: string) {
  try {
    const { scopes } = Bun.TOML.parse(await Bun.file(file).text()) as {
      scopes?: object;
    };
    return Object.keys(scopes ?? {});
  } catch {
    return undefined;
  }
}

/**
 * Warn about scopes that Fence Rider ignores, where a typo would otherwise pass
 * silently. Advisory only: it reads just the named file, so scopes SecretSpec
 * inherits from other files are not seen.
 */
async function inspectConfiguration() {
  const file = resolve(process.env["SECRETSPEC_FILE"] ?? "secretspec.toml");
  const scopes = await declaredScopes(file);
  if (!scopes)
    return [
      `Configuration: ${file} missing or unparsable; scope check skipped`,
    ];
  const unused = unrecognizedScopes(scopes).map(unusedScope);
  return unused.length ? unused : [`Configuration: ${file} scopes ok`];
}

/** Report each external tool's version against its supported range, then check the configuration. */
export async function doctor(): Promise<number> {
  const results = await Promise.all(dependencies.map(inspect));
  for (const { line } of results) console.log(line);
  for (const line of await inspectConfiguration()) console.log(line);
  return results.some(({ failed }) => failed) ? 1 : 0;
}
