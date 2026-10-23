import { Command, CommanderError } from "commander";
import { version } from "../package.json";
import { deployHelp, deployScript } from "./deploy";
import { doctor, doctorHelp } from "./doctor";
import { installHelp, installScript } from "./install";
import type { Io } from "./io";
import { lintHelp, lintScript } from "./lint";
import { emit } from "./shell";
import { validateTarget } from "./target";
import { tunnel, tunnelHelp } from "./tunnel";
import { UsageError } from "./usage-error";
import { variables, variablesHelp } from "./variables";

/** Parse one invocation before any workflow I/O; return a status rather than exiting. */
export async function main(args: string[], io: Io): Promise<number> {
  let status = 0;
  const program = new Command()
    .name("fence-rider")
    .description("SecretSpec-powered Forge development utility")
    .version(`fence-rider ${version}`, "-V, --version")
    .exitOverride()
    .configureOutput({
      writeOut: (text) => io.out(text.trimEnd()),
      // Commander errors can echo arbitrary input; report only trusted categories below.
      writeErr: () => {},
    })
    .addHelpText(
      "after",
      "\nScript commands print POSIX shell; variables uploads directly.\nSecretSpec CLI and Forge CLI must be installed on PATH and authenticated separately.\nPut Forge arguments after --, for example: fence-rider deploy -e staging -- --verbose\nNo tools are downloaded, no login or consent is automated. Run fence-rider doctor to check tools.\n",
    );

  const command = (name: string, summary: string, help: string) =>
    program
      .command(name)
      .description(summary)
      .addHelpText("after", `\n${help}\n`);
  const target = (cmd: Command) =>
    cmd.option(
      "-e, --environment <target>",
      "Override FORGE_ENVIRONMENT (default: development)",
      validateTarget,
    );

  // Only the first separator belongs to Fence Rider; preserve the entire Forge tail.
  const separator = args.indexOf("--");
  const wrapper = separator < 0 ? args : args.slice(0, separator);
  const forwarded = separator < 0 ? [] : args.slice(separator + 1);
  const requireWrapperOnly = () => {
    if (forwarded.length)
      throw new UsageError(
        "Forge arguments are not accepted by variables or doctor; use their --help for supported options",
      );
  };

  target(command("deploy", "Print a deployment script", deployHelp))
    .usage("[options] [-- <forge-args...>]")
    .action(({ environment }) => {
      status = emit(() => deployScript(forwarded, environment), io);
    });
  command("lint", "Print a configured lint script", lintHelp)
    .usage("[options] [-- <forge-args...>]")
    .action(() => {
      status = emit(() => lintScript(forwarded), io);
    });
  for (const name of ["install", "uninstall"] as const) {
    command(
      name,
      `Print an ${name === "install" ? "installation" : "uninstall"} script`,
      installHelp(name),
    )
      .usage("[options] [-- <forge-args...>]")
      .action(() => {
        status = emit(() => installScript(forwarded, name), io);
      });
  }
  target(command("tunnel", "Print a development tunnel script", tunnelHelp))
    .usage("[options] [-- <forge-args...>]")
    .action(async ({ environment }) => {
      status = await tunnel(forwarded, environment, io);
    });
  target(
    command("variables", "Upload encrypted runtime variables", variablesHelp),
  ).action(async ({ environment }) => {
    requireWrapperOnly();
    status = await variables(environment, io);
  });
  command("doctor", "Check installed tools and configuration", doctorHelp)
    .option(
      "--resolve",
      "Check required values resolve (may access providers)",
      false,
    )
    .action(async ({ resolve }) => {
      requireWrapperOnly();
      status = await doctor(io, { resolve });
    });

  try {
    await program.parseAsync(wrapper.length ? wrapper : ["--help"], {
      from: "user",
    });
    return status;
  } catch (error) {
    if (error instanceof UsageError) io.err(`Fence Rider: ${error.message}.`);
    else if (error instanceof CommanderError) {
      if (error.exitCode === 0) return 0;
      const causes: Record<string, string> = {
        "commander.unknownCommand": "Unknown command",
        "commander.unknownOption":
          "Unknown wrapper option; put Forge arguments after --",
        "commander.excessArguments":
          "Unexpected wrapper argument; put Forge arguments after --",
        "commander.optionMissingArgument":
          "Missing option value; use --environment TARGET or -e TARGET",
      };
      io.err(
        `Fence Rider: ${causes[error.code] ?? "Unsupported invocation"}. Run fence-rider --help for usage.`,
      );
    } else throw error;
    return 1;
  }
}
