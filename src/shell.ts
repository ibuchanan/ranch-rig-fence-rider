/** Build the shell scripts that `fence-rider lint|install|uninstall` print for a package script to run. */

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

/** Print a script on stdout, or the reason on stderr with no stdout so a guarded eval stops. */
export function emit(build: () => string) {
  try {
    console.log(build());
    return 0;
  } catch (error) {
    console.error(
      `Fence Rider: ${error instanceof Error ? error.message : error}`,
    );
    return 1;
  }
}
