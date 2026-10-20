import { version } from "../package.json";
import { deploy } from "./deploy";
import { lint } from "./lint";
import { install } from "./install";

const args = process.argv.slice(2);
if (
  args.length === 2 &&
  args[0] === "help" &&
  (args[1] === "install" || args[1] === "uninstall")
) {
  process.exit(await install(["--help"], args[1]));
}

if (args.length === 1 && (args[0] === "--version" || args[0] === "-V")) {
  console.log(`fence-rider ${version}`);
  process.exit(0);
}

const helpRequested =
  args.length === 0 ||
  (args.length === 1 && ["help", "--help", "-h"].includes(args[0] ?? "")) ||
  (args.length === 2 &&
    ((args[0] === "help" && ["deploy", "lint"].includes(args[1] ?? "")) ||
      (args[0] === "deploy" && ["--help", "-h"].includes(args[1] ?? ""))));

if (!helpRequested) {
  const command = args[0] === "help" ? args[1] : args[0];
  if (args[0] === "install" || args[0] === "uninstall")
    process.exit(await install(args.slice(1), args[0]));
  if (command === "tunnel") {
    console.error(
      `${command} is unsupported by Fence Rider. Use the Forge CLI directly: forge ${command}`,
    );
    process.exit(1);
  }
  if (args[0] === "lint") {
    process.exit(await lint(args.slice(1)));
  }
  if (args[0] === "deploy") {
    process.exit(await deploy(args.slice(1)));
  }
  console.error(
    "Unknown command or unsupported arguments. Run fence-rider --help for usage, or use the Forge CLI directly.",
  );
  process.exit(1);
}

console.log(`Fence Rider — SecretSpec-powered Forge development utility

Usage: fence-rider <command> [options]

Supported workflows:
  deploy       Deployment with encrypted runtime variables
  lint         Configured lint with live, unredacted Forge output
  install      Configured installation or explicit --upgrade; no runtime writes
  uninstall    Configured removal; changes remote installation state

Deployment target: explicit option, resolved FORGE_ENVIRONMENT
(FORGE_ENV legacy alias), then development.
Conflicting resolved names fail even with an explicit target.

Discovery:
  help, --help, -h       Show this help
  --version, -V          Show the version

Configured workflow prerequisites: SecretSpec CLI and Forge CLI must be installed on
PATH and authenticated separately. Fence Rider does not install tools or log in.

Install/uninstall targets: explicit options override resolved FORGE_SITE / FORGE_PRODUCT
and environment independently. Site/product are required. Only environment
falls back to development. Install consent/upgrade/non-interactive policy is explicit.
Uninstall inherits no install policy; Forge 14.2.0 has no --non-interactive option.

Tunnel remains unsupported; use the Forge CLI directly:
  forge tunnel
`);
