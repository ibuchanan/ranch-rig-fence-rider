import type { Io } from "./io";

/** Build the shell scripts that `fence-rider lint|deploy|tunnel|install|uninstall` print for a package script to run. */

/** One word quoted for POSIX sh; plain words stay readable. */
export function quote(word: string) {
  return /^[A-Za-z0-9_@%+=:,./-]+$/.test(word)
    ? word
    : `'${word.replaceAll("'", `'\\''`)}'`;
}

/**
 * A script that replaces the shell with `secretspec run` over the whole
 * profile, so signals and the exit status belong to the tools themselves.
 * Arguments a script runner appends to the shell command arrive as "$@".
 */
export function underSecretSpec(command: string[]) {
  return `exec secretspec run --scope '' -- ${command.map(quote).join(" ")} "$@"`;
}

const targetVariables = {
  environment: "FORGE_ENVIRONMENT",
  site: "FORGE_SITE",
  product: "FORGE_PRODUCT",
};

export type Target = keyof typeof targetVariables;

/** How a profile's selectors become Forge targets: only the environment has a default. */
const initial = (target: Target) =>
  target === "environment"
    ? `environment=\${FORGE_ENVIRONMENT-development}`
    : `${target}=\${${targetVariables[target]}-}`;

/**
 * The script a Forge command with profile-derived targets runs inside
 * `secretspec run`, which has put the resolved profile in the environment. The
 * command and forwarded arguments arrive as positional parameters, so no
 * caller-supplied text is ever interpolated into the script.
 */
function targetScript(
  targets: Target[],
  environment: string | undefined,
  prologue: string,
) {
  const start = targets.map((target) =>
    target === "environment" && environment !== undefined
      ? `environment=${quote(environment)}`
      : initial(target),
  );
  const names = targets.map((target) => `"$${target}"`).join(" ");
  const flags = targets.map((target) => `--${target} "$${target}"`).join(" ");
  const required = targets
    .filter((target) => target !== "environment")
    .map((target) => targetVariables[target]);
  const list = [targets.slice(0, -1).join(", "), targets.at(-1)]
    .filter(Boolean)
    .join(" or ");
  const fix = required.length
    ? `set ${required.join(" and ")} (FORGE_ENVIRONMENT defaults to development), none empty or starting with a dash`
    : "FORGE_ENVIRONMENT defaults to development but must not be empty or start with a dash";
  return `
command=$1; shift
${start.join("\n")}
for target in ${names}; do
  case $target in
    ''|-*)
      echo "Fence Rider: the ${list} target is missing or invalid; ${fix}" >&2
      exit 1 ;;
  esac
done
${prologue}exec forge "$command" ${flags} "$@"
`;
}

/**
 * Run one Forge command under the profile with `targets` taken from it. An
 * explicit `environment` replaces the profile's; a `prologue` of shell lines
 * runs after the targets are checked, to adjust the environment Forge sees.
 */
export function forgeUnderSecretSpec(options: {
  command: string;
  forwarded: string[];
  targets?: Target[];
  environment?: string | undefined;
  prologue?: string;
}) {
  const {
    command,
    forwarded,
    targets = ["environment"],
    environment,
  } = options;
  return underSecretSpec([
    "sh",
    "-c",
    targetScript(targets, environment, options.prologue ?? ""),
    "sh",
    command,
    ...forwarded,
  ]);
}

/** Print a script on stdout, or the reason on stderr with no stdout so a guarded eval stops. */
export function emit(build: () => string, io: Io) {
  try {
    io.out(build());
    return 0;
  } catch (error) {
    io.err(`Fence Rider: ${error instanceof Error ? error.message : error}`);
    return 1;
  }
}
