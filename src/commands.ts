import { deploy, deployUsage } from "./deploy";
import { doctor, doctorUsage } from "./doctor";
import { install, installUsage } from "./install";
import { lint, lintUsage } from "./lint";
import { tunnel, tunnelUsage } from "./tunnel";
import { variables, variablesUsage } from "./variables";

/** One top-level command: its help is defined here once and reused everywhere. */
type Command = {
  /** Listed in top-level help when present. */
  summary?: string;
  usage: string;
  /** Receives the arguments after the command name; returns the exit code. */
  run: (args: string[]) => number | Promise<number>;
};

/** The one error for any invocation the command table cannot resolve. */
export function unknownInvocation() {
  console.error(
    "Unknown command or unsupported arguments. Run fence-rider --help for usage, or use the Forge CLI directly.",
  );
  return 1;
}

/** Look up a command by exact name; inherited object keys are not commands. */
export function findCommand(name: string | undefined) {
  return name !== undefined && Object.hasOwn(commands, name)
    ? commands[name]
    : undefined;
}

const commands: Record<string, Command> = {
  deploy: {
    summary: "Prints a script for deployment under secretspec run",
    usage: deployUsage,
    run: deploy,
  },
  variables: {
    summary: "Uploads encrypted runtime variables; run when they change",
    usage: variablesUsage,
    run: variables,
  },
  lint: {
    summary: "Prints a script for lint under secretspec run",
    usage: lintUsage,
    run: lint,
  },
  install: {
    summary:
      "Prints a script for installation or --upgrade under secretspec run",
    usage: installUsage("install"),
    run: (args) => install(args, "install"),
  },
  uninstall: {
    summary: "Prints a script for removal; changes remote installation state",
    usage: installUsage("uninstall"),
    run: (args) => install(args, "uninstall"),
  },
  tunnel: {
    summary:
      "Prints a script for a tunnel with runtime variables; development only",
    usage: tunnelUsage,
    run: tunnel,
  },
  doctor: {
    summary: "Check SecretSpec and Forge versions against the tested range",
    usage: doctorUsage,
    run: async (args) => (args.length ? unknownInvocation() : doctor()),
  },
};

/** Top-level help lines, one per command that has a summary. */
export const workflowListing = Object.entries(commands)
  .filter(([, { summary }]) => summary)
  .map(([name, { summary }]) => `  ${name.padEnd(12)} ${summary}`)
  .join("\n");
