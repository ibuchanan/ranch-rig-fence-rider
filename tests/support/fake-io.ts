import { basename } from "node:path";
import { main } from "../../src/cli";
import { consoleIo, type Io } from "../../src/io";
import { CommandFailure } from "../../src/process";
import {
  deploymentSchema,
  deploymentSpec,
  deploymentValues,
  type ToolCall,
  type WorkflowOptions,
} from "./fixtures.ts";
import { expectNoSecretInOutput } from "./guarantees.ts";
import { AnswerFailure, secretspecAnswer } from "./secretspec-answers.ts";

/**
 * The in-process counterpart of the fake SecretSpec and Forge in fake-tool.ts:
 * the same options drive the same answers, but helper calls are answered and
 * recorded here instead of by spawned scripts. It covers what a command does
 * through Io; process-level behavior (PATH lookup, interruption, exec) stays
 * with the integration tests.
 */

export type InProcessOptions = Omit<
  WorkflowOptions,
  | "blockStage"
  | "ignoreSignal"
  | "spawnDescendant"
  | "onSpawn"
  | "realSecretSpec"
  | "dotenv"
  | "files"
>;

const schemaOf = (options: InProcessOptions) =>
  Object.hasOwn(options, "schema") ? options.schema : deploymentSchema;

const valuesOf = (options: InProcessOptions) =>
  Object.hasOwn(options, "values") ? options.values : deploymentValues;

/** Fail the way the spawned fake did when a stage was told to fail. */
function failIfScripted(options: InProcessOptions, args: string[]) {
  if (options.failStage !== args[0]) return;
  if (options.failKey && options.failKey !== args[5]) return;
  if (options.failureMode === "throw")
    throw new CommandFailure("exit status 1", 1, "synthetic error details");
  if (options.failureMode === "signal")
    throw new CommandFailure("terminated by SIGTERM");
  const status = options.exitCode ?? 23;
  throw new CommandFailure(`exit status ${status}`, status);
}

/** Answer one helper call as the fake tool would, after recording it. */
export function answer(
  options: InProcessOptions,
  tool: string,
  args: string[],
) {
  failIfScripted(options, args);
  if (tool !== "secretspec") return "";
  try {
    return secretspecAnswer(
      args,
      {
        schema: schemaOf(options),
        values: valuesOf(options),
        schemaOutput: options.schemaOutput,
        exportOutput: options.exportOutput,
      },
      () => {
        const file = options.env?.["SECRETSPEC_FILE"];
        // The spawned fake read the file it was pointed at, and failed if it was absent.
        if (file !== undefined)
          throw new CommandFailure("exit status 1", 1, `No such file: ${file}`);
        return options.spec ?? deploymentSpec;
      },
    );
  } catch (error) {
    if (!(error instanceof AnswerFailure)) throw error;
    throw new CommandFailure(
      `exit status ${error.status}`,
      error.status,
      error.message,
      error.output,
    );
  }
}

/** Run one `fence-rider` invocation in-process against the fake tools. */
export async function runInProcess(
  options: InProcessOptions = {},
  command = options.command ?? "variables",
) {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const interactions: ToolCall[] = [];
  const env: NodeJS.ProcessEnv = {
    PATH: "/fake/bin",
    HOME: "/fake/home",
    ...options.env,
  };
  const schema = schemaOf(options) as
    | { properties?: Record<string, unknown> }
    | null
    | undefined;
  const names = Object.keys(schema?.properties ?? {});

  const io: Io = {
    ...consoleIo,
    out: (text) => void stdout.push(`${text}\n`),
    err: (text) => void stderr.push(`${text}\n`),
    env,
    which: (tool) =>
      options.missingTool === tool ? null : `/fake/bin/${tool}`,
    readFile: async (path) => {
      if (path !== "manifest.yml" || options.manifest === null)
        throw new Error(`ENOENT: no such file or directory, open '${path}'`);
      return options.manifest ?? "app: {}\n";
    },
    capture: async (path, args, _signal, callEnv = env) => {
      // which() hands back a full path; the fake tools know themselves by name.
      const tool = basename(path);
      if (options.launchTool === tool)
        throw new CommandFailure(
          "unable to launch executable; check installation and its interpreter",
        );
      interactions.push({
        tool,
        args,
        values: Object.fromEntries(
          names
            .filter((name) => callEnv[name] !== undefined)
            .map((name) => [name, callEnv[name] as string]),
        ),
      });
      return answer(options, tool, args);
    },
  };

  const exitCode = await main([command, ...(options.args ?? [])], io);
  const out = stdout.join("");
  const err = stderr.join("");
  expectNoSecretInOutput(
    `fence-rider ${[command, ...(options.args ?? [])].join(" ")}`,
    {
      stdout: out,
      stderr: err,
    },
  );
  return { exitCode, stdout: out, stderr: err, interactions };
}
