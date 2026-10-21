/**
 * The fake SecretSpec and Forge for the process-level tests.
 *
 * One source serves both: it is written as `secretspec` and as `forge`, and
 * learns which it is from the name it was invoked as. It runs
 * as a standalone Bun script, so it imports nothing from this repository at load time; the
 * fixtures hand it everything through the `FIXTURE` environment variable and
 * the path of the shared answers module through `FAKE_ANSWERS`.
 */
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { basename } from "node:path";

type Fixture = {
  schema?: { properties?: Record<string, unknown>; required?: string[] };
  values?: Record<string, string>;
  schemaOutput?: string;
  exportOutput?: string;
  failStage?: string;
  failKey?: string;
  exitCode?: number;
  failureMode?: "throw" | "signal";
  blockStage?: string;
  ignoreSignal?: boolean;
  spawnDescendant?: boolean;
  /** The hostile text the fake emits where a real tool might echo a value. */
  hostile: string;
};

const env = process.env;
const args = process.argv.slice(2);
const tool = basename(process.argv[1] ?? "");
const scripted = ["lint", "deploy", "install", "uninstall", "tunnel"];
const fixture: Fixture = JSON.parse(env["FIXTURE"] ?? "{}");
const names = Object.keys(fixture.schema?.properties ?? {});
const command = args[0] ?? "";

appendFileSync(
  env["TOOL_CALL_LOG"] ?? "",
  `${JSON.stringify({
    tool,
    args,
    ...(command === "tunnel"
      ? {
          runtime: Object.fromEntries(
            Object.entries(env)
              .filter(([name]) => name.startsWith("FORGE_USER_VAR_"))
              .map(([name, value]) => [name.slice(15), value]),
          ),
        }
      : {}),
    values: Object.fromEntries(
      names
        .filter((name) => env[name] !== undefined)
        .map((name) => [name, env[name]]),
    ),
  })}\n`,
);

if (tool === "secretspec" && env["REAL_SECRETSPEC"]) {
  const result = Bun.spawnSync([env["REAL_SECRETSPEC"], ...args], {
    stdout: "pipe",
    stderr: "pipe",
  });
  process.stdout.write(result.stdout);
  process.stderr.write(result.stderr);
  process.exit(result.exitCode);
}

if (tool === "secretspec" && command === "run") {
  if (fixture.failStage === "run") process.exit(fixture.exitCode ?? 23);
  const missing = (fixture.schema?.required ?? []).find(
    (name) => !Object.hasOwn(fixture.values ?? {}, name),
  );
  if (missing !== undefined) {
    console.error(`Secret '${missing}' is required but not set`);
    process.exit(1);
  }
  // Like the real secretspec run: survive an operator signal that reaches the whole process group and wait for the child's own shutdown.
  for (const signal of ["SIGINT", "SIGTERM"] as const)
    process.on(signal, () => {});
  let child: Bun.Subprocess<"inherit", "inherit", "inherit">;
  try {
    child = Bun.spawn(args.slice(args.indexOf("--") + 1), {
      env: { ...env, ...fixture.values },
      stdin: "inherit",
      stdout: "inherit",
      stderr: "inherit",
    });
  } catch {
    console.error("Failed to run command: unable to launch the executable");
    process.exit(1);
  }
  const status = await child.exited;
  if (child.signalCode) {
    process.removeAllListeners("SIGINT");
    process.removeAllListeners("SIGTERM");
    process.kill(process.pid, child.signalCode);
    await Bun.sleep(1000);
  }
  process.exit(status ?? 1);
}

if (scripted.includes(command)) {
  console.log(`synthetic ${command} result`);
  console.error(`synthetic ${command} warning`);
  if (env["LINT_READ_INPUT"])
    Bun.stdin.text().then((input) => {
      console.log(`input:${input}`);
      console.log(`ordinary:${env["ORDINARY_SETTING"]}`);
      console.log(`auth:${env["FORGE_API_TOKEN"]}`);
    });
} else console.error(`synthetic helper noise: ${fixture.hostile}`);

if (
  fixture.failStage === command &&
  (!fixture.failKey || fixture.failKey === args[5])
) {
  if (!scripted.includes(command)) console.log(fixture.hostile);
  if (fixture.failureMode === "throw")
    throw new Error(`synthetic error details: ${fixture.hostile}`);
  if (fixture.failureMode === "signal") process.kill(process.pid, "SIGTERM");
  else process.exit(fixture.exitCode ?? 23);
}

if (fixture.blockStage === command) {
  if (fixture.spawnDescendant)
    Bun.spawn(
      [
        process.execPath,
        "-e",
        'process.on("SIGINT", () => {}); process.on("SIGTERM", () => {}); require("node:fs").writeFileSync("descendant-ready", String(process.pid)); setInterval(() => {}, 1000);',
      ],
      { stdin: "ignore", stdout: "ignore", stderr: "ignore" },
    );
  for (const signal of ["SIGINT", "SIGTERM"] as const)
    process.on(signal, () => {
      writeFileSync("received-signal", signal);
      console.error(
        scripted.includes(command)
          ? `synthetic ${command} interrupted`
          : `synthetic signal error: ${fixture.hostile}`,
      );
      if (!fixture.ignoreSignal) process.exit(0);
    });
  setInterval(() => {}, 1000);
  writeFileSync("ready", String(process.pid));
} else if (tool === "secretspec") {
  // The answers come from the module the in-process fake uses too.
  // fallow-ignore-next-line unresolved-import -- the path arrives in FAKE_ANSWERS at run time
  const answers: typeof import("./secretspec-answers.ts") = await import(
    env["FAKE_ANSWERS"] ?? ""
  );
  try {
    console.log(
      answers.secretspecAnswer(args, fixture, () =>
        readFileSync(env["SECRETSPEC_FILE"] ?? "secretspec.toml", "utf8"),
      ),
    );
  } catch (error) {
    if (!(error instanceof answers.AnswerFailure)) throw error;
    console.error(error.message);
    process.exit(error.status);
  }
}
