import { version } from "../package.json";
import { findCommand, unknownInvocation, workflowListing } from "./commands";
import type { Io } from "./io";

const topLevelHelp = `Fence Rider — SecretSpec-powered Forge development utility

Usage: fence-rider <command> [options]

Supported workflows:
${workflowListing}

lint, deploy, tunnel, install and uninstall print a shell script instead of running
Forge. Run one from a package script, for example:
  "lint:forge": "cmd=$(fence-rider lint) && sh -c \\"$cmd\\" sh"
The && stops the script if fence-rider refuses. variables runs directly: it uploads
the runtime variables that deploy, like forge deploy, leaves alone.

Deployment target: explicit option, resolved FORGE_ENVIRONMENT, then development.

Discovery:
  help, --help, -h       Show this help
  --version, -V          Show the version

SecretSpec CLI must be installed on PATH; no downloads or installs.
Run fence-rider doctor to compare installed tool versions with the tested range.
Forge CLI must be installed on PATH and authenticated separately; no automatic login.

Install/uninstall targets: resolved FORGE_SITE / FORGE_PRODUCT / FORGE_ENVIRONMENT only;
no target options. Site/product are required. Only environment falls back to
development. Install consent/upgrade/non-interactive policy is explicit.
Uninstall inherits no install policy; Forge 14.2.0 has no --non-interactive option.

Tunnel maps explicit runtime members to FORGE_USER_VAR_<name>; no remote uploads.
Staging/production are unsupported; named targets must be development environments.
Use fence-rider tunnel --help for tunnel options (-h is debug host, not help).
`;

type Handler = (args: string[], io: Io) => number | Promise<number>;

/** Discovery flags accept no further arguments. */
const bare =
  (show: (io: Io) => number): Handler =>
  (args, io) =>
    args.length ? unknownInvocation(io) : show(io);

function showHelp(io: Io) {
  io.out(topLevelHelp);
  return 0;
}

function showVersion(io: Io) {
  io.out(`fence-rider ${version}`);
  return 0;
}

/** `help <command>`: exactly one known command name. */
function showUsage(names: string[], io: Io) {
  const command = names.length === 1 ? findCommand(names[0]) : undefined;
  if (!command) return unknownInvocation(io);
  io.out(command.usage);
  return 0;
}

const discovery: Record<string, Handler> = {
  help: (args, io) => (args.length ? showUsage(args, io) : showHelp(io)),
  "--help": bare(showHelp),
  "-h": bare(showHelp),
  "--version": bare(showVersion),
  "-V": bare(showVersion),
};

function resolve(name: string): Handler | undefined {
  return Object.hasOwn(discovery, name)
    ? discovery[name]
    : findCommand(name)?.run;
}

/** Run one invocation (the arguments after `fence-rider`) and return its exit code. */
export async function main([first = "help", ...rest]: string[], io: Io) {
  const handler = resolve(first);
  return handler ? handler(rest, io) : unknownInvocation(io);
}
