#!/usr/bin/env bun
import { version } from "../package.json";
import { findCommand, unknownInvocation, workflowListing } from "./commands";

const topLevelHelp = `Fence Rider — SecretSpec-powered Forge development utility

Usage: fence-rider <command> [options]

Supported workflows:
${workflowListing}

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

Tunnel uses explicit runtime members via FORGE_USER_VAR_<name>; no remote uploads.
Staging/production are unsupported; named targets must be development environments.
Use fence-rider tunnel --help for tunnel options (-h is debug host, not help).
`;

function showHelp() {
  console.log(topLevelHelp);
  return 0;
}

function showVersion() {
  console.log(`fence-rider ${version}`);
  return 0;
}

/** `help <command>`: exactly one known command name. */
function showUsage(names: string[]) {
  const command = names.length === 1 ? findCommand(names[0]) : undefined;
  if (!command) return unknownInvocation();
  console.log(command.usage);
  return 0;
}

type Handler = (args: string[]) => number | Promise<number>;

/** Discovery flags accept no further arguments. */
const bare =
  (show: () => number): Handler =>
  (args) =>
    args.length ? unknownInvocation() : show();

const discovery: Record<string, Handler> = {
  help: (args) => (args.length ? showUsage(args) : showHelp()),
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

async function dispatch([first = "help", ...rest]: string[]) {
  const handler = resolve(first);
  return handler ? handler(rest) : unknownInvocation();
}

process.exit(await dispatch(process.argv.slice(2)));
