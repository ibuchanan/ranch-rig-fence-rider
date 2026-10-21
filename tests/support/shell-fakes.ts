import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { cli } from "./cli.ts";

/**
 * Minimal POSIX sh stand-ins for `secretspec run` and `forge`, for running the
 * generated scripts without a Bun interpreter start per tool. Behavior is driven
 * by FAKE_* variables, and the calls are recorded in files under FAKE_DIR.
 */
const forge = `#!/bin/sh
printf '%s\\0' "$@" > "$FAKE_DIR/forge-args"
printf '%s' "$$" > "$FAKE_DIR/forge-pid"
env > "$FAKE_DIR/forge-env"
if [ -n "$FAKE_STREAM" ]; then
  echo "synthetic forge result"
  echo "synthetic forge warning" >&2
  echo "ordinary:$ORDINARY_SETTING"
  echo "auth:$FORGE_API_TOKEN"
  printf 'input:'
  cat
fi
exit "$FAKE_FORGE_STATUS"
`;

const secretspec = `#!/bin/sh
printf '%s\\0' "$@" > "$FAKE_DIR/secretspec-args"
if [ "$FAKE_SECRETSPEC_STATUS" != 0 ]; then
  echo "synthetic secretspec failure" >&2
  exit "$FAKE_SECRETSPEC_STATUS"
fi
if [ "$1" != run ] || [ "$2" != --scope ] || [ "$4" != -- ]; then
  echo "unexpected secretspec call" >&2
  exit 64
fi
shift 4
# Like secretspec run: resolved values override ambient ones; nothing else is touched.
while IFS= read -r line; do
  [ -n "$line" ] && export "$line"
done < "$FAKE_DIR/values"
for name in $FAKE_REQUIRED; do
  printenv "$name" > /dev/null || {
    echo "Secret '$name' is required but not set" >&2
    exit 1
  }
done
exec "$@"
`;

export type FakeRun = {
  /** The script text, run as `sh -c <script> sh <appended…>`. */
  script: string;
  /** Arguments a script runner appends, arriving as "$@". */
  appended?: readonly string[];
  /** What the profile resolves, as NAME → value. */
  values?: Record<string, string>;
  /** Names `secretspec run` must find resolved or exported, else it fails. */
  required?: readonly string[];
  /** Ambient environment of the script. */
  env?: Record<string, string>;
  forgeStatus?: number;
  secretspecStatus?: number;
  /** Make the fake forge stream output and echo stdin, like a real interactive Forge. */
  stream?: boolean;
};

let sharedBin: string | undefined;

/**
 * The fake executables, written once per test file: the first exec of a freshly
 * written file is slow on macOS, so each test gets its own data directory but
 * shares these.
 */
function fakeBin() {
  if (sharedBin) return sharedBin;
  sharedBin = join(mkdtempSync(join(cli.workspace, "fakes-bin-")), "bin");
  mkdirSync(sharedBin);
  writeFileSync(join(sharedBin, "forge"), forge, { mode: 0o755 });
  writeFileSync(join(sharedBin, "secretspec"), secretspec, { mode: 0o755 });
  symlinkSync(cli.executable, join(sharedBin, "fence-rider"));
  return sharedBin;
}

/** Start a script in a fresh data directory with the fakes first on PATH; the caller owns stdin. */
export function startWithFakes(run: FakeRun) {
  const bin = fakeBin();
  const dir = mkdtempSync(join(cli.workspace, "fakes-"));
  writeFileSync(
    join(dir, "values"),
    `${Object.entries(run.values ?? {})
      .map(([name, value]) => `${name}=${value}`)
      .join("\n")}\n`,
  );
  const child = Bun.spawn(
    ["/bin/sh", "-c", run.script, "sh", ...(run.appended ?? [])],
    {
      cwd: dir,
      env: {
        PATH: `${bin}:/usr/bin:/bin`,
        HOME: dir,
        FAKE_DIR: dir,
        FAKE_REQUIRED: (run.required ?? []).join(" "),
        FAKE_FORGE_STATUS: String(run.forgeStatus ?? 0),
        FAKE_SECRETSPEC_STATUS: String(run.secretspecStatus ?? 0),
        ...(run.stream ? { FAKE_STREAM: "1" } : {}),
        ...run.env,
      },
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe",
    },
  );
  return { child, dir };
}

async function readNul(path: string) {
  const file = Bun.file(path);
  return (await file.exists())
    ? (await file.text()).split("\0").slice(0, -1)
    : undefined;
}

/** NAME=value lines of `env`, as an object; undefined if Forge never ran. */
async function readEnv(path: string) {
  const file = Bun.file(path);
  if (!(await file.exists())) return undefined;
  const lines = (await file.text()).split("\n").filter((line) => line !== "");
  return Object.fromEntries(
    lines.map((line) => [
      line.slice(0, line.indexOf("=")),
      line.slice(line.indexOf("=") + 1),
    ]),
  );
}

/** Run a script against the fakes and report what the tools saw. */
export async function runWithFakes(run: FakeRun) {
  const { child, dir } = startWithFakes(run);
  child.stdin.end();
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  const pid = await Bun.file(join(dir, "forge-pid"))
    .exists()
    .then(async (exists) =>
      exists
        ? Number(await Bun.file(join(dir, "forge-pid")).text())
        : undefined,
    );
  return {
    exitCode,
    stdout,
    stderr,
    /** The arguments Forge received, one entry each; undefined if Forge never ran. */
    forgeArgs: await readNul(join(dir, "forge-args")),
    forgeEnv: await readEnv(join(dir, "forge-env")),
    /** Forge's process id; equal to the script's own when every hop used exec. */
    forgePid: pid,
    scriptPid: child.pid,
    secretspecArgs: await readNul(join(dir, "secretspec-args")),
  };
}
