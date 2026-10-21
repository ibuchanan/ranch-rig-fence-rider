import { capture } from "./process";

/**
 * Lowest supported and highest tested release of each external tool. Only the
 * baseline Fence Rider was built against has been exercised, so both bounds
 * start there; widen `tested` as newer releases are verified.
 */
const dependencies = [
  {
    name: "SecretSpec",
    tool: "secretspec",
    lowest: "0.21.1",
    tested: "0.21.1",
  },
  { name: "Forge CLI", tool: "forge", lowest: "14.2.0", tested: "14.2.0" },
];

type Dependency = (typeof dependencies)[number];

export const doctorUsage = [
  "Usage: fence-rider doctor",
  "Report the SecretSpec and Forge CLI versions on PATH against the lowest supported and highest tested versions.",
  "Exits 1 when a tool is missing, unreadable or older than supported; a newer version is only a warning.",
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

/** Report each external tool's version against its supported range. */
export async function doctor(): Promise<number> {
  const results = await Promise.all(dependencies.map(inspect));
  for (const { line } of results) console.log(line);
  return results.some(({ failed }) => failed) ? 1 : 0;
}
