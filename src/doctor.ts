import { resolve } from "node:path";
import {
  checkManifest,
  schemaNames,
  scopeMembers,
  unresolvedRequired,
} from "./configured";
import type { Io } from "./io";
import { isLocalControl, localControls } from "./policy";
import { tunnelClears } from "./tunnel-plan";
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

export const doctorHelp = [
  "Report the SecretSpec and Forge CLI versions on PATH against the lowest supported and highest tested versions.",
  "Reads SecretSpec's declared schema, which carries no values, and applies the rules variables applies when it resolves the profile: every name is letters, digits and underscores and does not start with a digit, and every declaration is a string or string-or-null. Asks SecretSpec (value-free) for the manifest scope's members, including a scope inherited through project.extends, and checks that manifest.yml declares them. Likewise asks for the runtime scope's members and reports what variables would upload: an undefined or empty scope is a warning, a local control (FORGE_ENVIRONMENT, FORGE_SITE, FORGE_PRODUCT) among them is a failure. Warns, by name only, about values already exported in the shell that can change a generated command: declared keys and local controls, which secretspec run leaves in place for unresolved optional declarations, and FORGE_USER_VAR_ names that tunnel cannot clear; this is advisory and never prints a value. Also reads the SecretSpec file (SECRETSPEC_FILE, else ./secretspec.toml) only to warn about scopes Fence Rider never reads.",
  "--resolve additionally asks SecretSpec (`check --json`, value-free) whether every required value resolves, and names the ones that do not. Resolving reads the provider, so it may prompt for vault authentication and add audit entries; without the flag doctor makes no such call. An unresolved optional value is not a failure.",
  "Exits 1 when a tool is missing, unreadable or older than supported, the schema has an unsupported name or type, a manifest scope member is not declared in manifest.yml, a runtime scope member is a local control, or with --resolve a required value does not resolve; a newer version, an unused scope, an empty runtime scope or ambient shadowing is only a warning.",
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
async function detectVersion(path: string, io: Io) {
  try {
    const output = await io.capture(
      path,
      ["--version"],
      new AbortController().signal,
    );
    return /\d+(?:\.\d+)+/.exec(output)?.[0];
  } catch {
    return undefined;
  }
}

async function inspect(dependency: Dependency, io: Io) {
  const range = `supported from ${dependency.lowest}, tested through ${dependency.tested}`;
  const path = io.which(dependency.tool);
  if (!path)
    return {
      failed: true,
      line: `${dependency.name}: not found on PATH (${range}). Install it and authenticate separately.`,
    };
  const version = await detectVersion(path, io);
  if (!version)
    return {
      failed: true,
      line: `${dependency.name}: version could not be read from \`${dependency.tool} --version\` (${range})`,
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
async function declaredScopes(file: string, io: Io) {
  try {
    const { scopes } = Bun.TOML.parse(await io.readFile(file)) as {
      scopes?: object;
    };
    return Object.keys(scopes ?? {});
  } catch {
    return undefined;
  }
}

const specificationFile = (io: Io) =>
  resolve(io.env["SECRETSPEC_FILE"] ?? "secretspec.toml");

/**
 * Warn about scopes that Fence Rider ignores, where a typo would otherwise pass
 * silently. Advisory only: it reads just the named file, so scopes SecretSpec
 * inherits from other files are not seen.
 */
function scopeLines(file: string, scopes: string[] | undefined) {
  if (!scopes)
    return [
      `Configuration: ${file} missing or unparsable; scope check skipped`,
    ];
  const unused = unrecognizedScopes(scopes).map(unusedScope);
  return unused.length ? unused : [`Configuration: ${file} scopes ok`];
}

/** Check that the manifest scope's members are declared in manifest.yml; the check asks SecretSpec, value-free. */
async function inspectManifest(secretspec: string | undefined, io: Io) {
  const skipped = {
    failed: false,
    line: "Manifest: no manifest scope; check skipped",
  };
  if (!secretspec) return skipped;
  const state = {
    stage: "manifest validation",
    signal: new AbortController().signal,
    io,
  };
  try {
    const names = await scopeMembers(secretspec, "manifest", state);
    if (!names.length) return skipped;
    await checkManifest(async () => names, state);
    return {
      failed: false,
      line: "Manifest: manifest scope members are declared in manifest.yml",
    };
  } catch {
    return { failed: true, line: `Manifest: ${state.stage} failed` };
  }
}

/** Report what `variables` would do with the runtime scope's members; never prints a value. */
async function inspectRuntime(secretspec: string | undefined, io: Io) {
  if (!secretspec)
    return {
      failed: false,
      line: "Runtime: SecretSpec missing; check skipped",
    };
  const state = {
    stage: "runtime scope",
    signal: new AbortController().signal,
    io,
  };
  try {
    const names = await scopeMembers(secretspec, "runtime", state);
    if (!names.length)
      return {
        failed: false,
        line: "Runtime: scope is undefined or has no members; variables would upload nothing",
      };
    const control = names.find(isLocalControl);
    if (control)
      return {
        failed: true,
        line: `Runtime: ${control} is a local control; variables refuses to upload it`,
      };
    return {
      failed: false,
      line: `Runtime: ${names.length} member${names.length === 1 ? "" : "s"} would be uploaded by variables`,
    };
  } catch {
    return { failed: true, line: `Runtime: ${state.stage} failed` };
  }
}

/** Check that the schema's names and types are ones `variables` accepts; the schema carries no values. */
async function inspectSchema(secretspec: string | undefined, io: Io) {
  if (!secretspec)
    return { failed: false, line: "Schema: SecretSpec missing; check skipped" };
  const state = {
    stage: "SecretSpec schema",
    signal: new AbortController().signal,
    io,
  };
  try {
    const names = await schemaNames(secretspec, state);
    return {
      failed: false,
      line: `Schema: ${names.length} declaration${names.length === 1 ? "" : "s"} ok`,
    };
  } catch {
    return { failed: true, line: `Schema: ${state.stage} failed` };
  }
}

/**
 * Warn, by name only, about exported values that can change a generated
 * command: declared keys and local controls, which `secretspec run` leaves in
 * place when an optional declaration is unresolved, and FORGE_USER_VAR_ names
 * that `tunnel` cannot clear. Advisory; never prints a value.
 */
async function inspectAmbient(secretspec: string | undefined, io: Io) {
  const state = {
    stage: "SecretSpec schema",
    signal: new AbortController().signal,
    io,
  };
  const declared = secretspec
    ? await schemaNames(secretspec, state).catch(() => [])
    : [];
  const shadowing = new Set([...declared, ...localControls]);
  const names = Object.keys(io.env).filter(
    (name) =>
      shadowing.has(name) ||
      (name.startsWith("FORGE_USER_VAR_") && !tunnelClears(name)),
  );
  return names.length
    ? names.map(
        (name) =>
          `Environment: ${name} is exported and may shadow a generated command; unset it if that is unintended`,
      )
    : ["Environment: no ambient shadowing"];
}

/** Name, never a value, the required values the profile does not resolve; only run on request, since resolving reads the provider. */
async function inspectResolution(secretspec: string | undefined, io: Io) {
  if (!secretspec)
    return {
      failed: false,
      line: "Resolution: SecretSpec missing; check skipped",
    };
  const state = {
    stage: "SecretSpec resolution",
    signal: new AbortController().signal,
    io,
  };
  try {
    const names = await unresolvedRequired(secretspec, state);
    return names.length
      ? {
          failed: true,
          line: `Resolution: required values do not resolve: ${names.join(", ")}`,
        }
      : { failed: false, line: "Resolution: every required value resolves" };
  } catch {
    return { failed: true, line: `Resolution: ${state.stage} failed` };
  }
}

export type DoctorOptions = { resolve: boolean };

/** The lines of one doctor run, and whether any of them is a failure. */
async function inspectAll(io: Io, { resolve: resolution }: DoctorOptions) {
  const file = specificationFile(io);
  const scopes = await declaredScopes(file, io);
  const secretspec = io.which("secretspec") ?? undefined;
  const checks = [
    ...(await Promise.all(
      dependencies.map((dependency) => inspect(dependency, io)),
    )),
    await inspectSchema(secretspec, io),
    await inspectManifest(secretspec, io),
    await inspectRuntime(secretspec, io),
    ...(resolution ? [await inspectResolution(secretspec, io)] : []),
  ];
  return {
    lines: [
      ...checks.map(({ line }) => line),
      ...scopeLines(file, scopes),
      ...(await inspectAmbient(secretspec, io)),
    ],
    failed: checks.some(({ failed }) => failed),
  };
}

/** Report each external tool's version against its supported range, then check the configuration. */
export async function doctor(
  io: Io,
  options: DoctorOptions = { resolve: false },
): Promise<number> {
  const { lines, failed } = await inspectAll(io, options);
  for (const line of lines) io.out(line);
  return failed ? 1 : 0;
}
