import { isLocalControl } from "./policy";

const reservedPrefix = "FORGE_USER_VAR_";

/** Whether the prologue's cleanup loop can see and unset this ambient name. */
export const tunnelClears = (name: string) =>
  /^FORGE_USER_VAR_[A-Za-z0-9_]*$/.test(name);

const isReserved = (name: string) => name.startsWith(reservedPrefix);

/**
 * Shell lines that give Forge the runtime members alone as
 * FORGE_USER_VAR_<name>, run inside `secretspec run` where each member is
 * already in the environment. Ambient prefixed variables are removed first;
 * a member that is set, even to the empty string, is mapped.
 */
export function tunnelPrologue(declared: string[], runtime: string[]) {
  if (declared.some(isReserved))
    throw new Error("Reserved tunnel prefix in application declaration");
  const mappings = runtime.map((key) => {
    if (isLocalControl(key))
      throw new Error("Local control cannot be a tunnel runtime variable");
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key))
      throw new Error("Invalid variable name");
    return `if [ "\${${key}+set}" ]; then export ${reservedPrefix}${key}="$${key}"; fi\n`;
  });
  return [
    `for name in $(env | sed -n 's/^\\(${reservedPrefix}[A-Za-z0-9_]*\\)=.*/\\1/p'); do unset "$name"; done\n`,
    ...mappings,
  ].join("");
}
