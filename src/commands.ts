import { deploy, deployUsage } from "./deploy";
import { install, installUsage } from "./install";
import { lint, lintUsage } from "./lint";
import { setup, setupUsage } from "./setup";
import { tunnel, tunnelUsage } from "./tunnel";

/** One top-level command: its help is defined here once and reused everywhere. */
type Command = {
  /** Listed in top-level help when present. */
  summary?: string;
  usage: string;
  /** Receives the arguments after the command name; returns the exit code. */
  run: (args: string[]) => Promise<number>;
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
    summary: "Deployment with encrypted runtime variables",
    usage: deployUsage,
    run: deploy,
  },
  lint: {
    summary: "Configured lint with live, unredacted Forge output",
    usage: lintUsage,
    run: lint,
  },
  install: {
    summary: "Configured installation or explicit --upgrade; no runtime writes",
    usage: installUsage("install"),
    run: (args) => install(args, "install"),
  },
  uninstall: {
    summary: "Configured removal; changes remote installation state",
    usage: installUsage("uninstall"),
    run: (args) => install(args, "uninstall"),
  },
  tunnel: {
    summary: "Configured local runtime delivery; development environments only",
    usage: tunnelUsage,
    run: tunnel,
  },
  setup: {
    usage: setupUsage,
    run: async (args) => (args.length ? unknownInvocation() : setup()),
  },
};

/** Top-level help lines, one per command that has a summary. */
export const workflowListing = Object.entries(commands)
  .filter(([, { summary }]) => summary)
  .map(([name, { summary }]) => `  ${name.padEnd(12)} ${summary}`)
  .join("\n");
