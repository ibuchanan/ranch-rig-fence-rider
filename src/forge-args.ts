/** A wrapper-owned diagnostic safe to display; never include caller values or helper output. */
export class UsageError extends Error {}

/** The only options the wrapper reads; everything else is forwarded to Forge untouched. */
export type CommandSpec = {
  /** Options the wrapper owns and re-injects, as name -> short letter (long form is `--name`). */
  owned: Record<string, string>;
  /** Flags that request wrapper help instead of running Forge. */
  help: string[];
};

export type ParsedArgs = {
  owned: Record<string, string>;
  forwarded: string[];
  help: boolean;
};

type Validate = (name: string, value: string) => string;

function ownedName(spec: CommandSpec, arg: string) {
  const long = /^--([^=]+)(?:=(.*))?$/s.exec(arg);
  if (long && Object.hasOwn(spec.owned, long[1] as string))
    return { name: long[1] as string, value: long[2] };
  const short = /^-([^-])(.*)$/s.exec(arg);
  const name = Object.keys(spec.owned).find(
    (key) => spec.owned[key] === short?.[1],
  );
  if (!short || name === undefined) return undefined;
  if (short[2]?.startsWith("="))
    throw new UsageError(
      `Unsupported short equals for -${spec.owned[name]}; use -${spec.owned[name]} VALUE or --${name}=VALUE`,
    );
  return { name, value: short[2] || undefined };
}

/**
 * Lift the wrapper-owned options out of Forge arguments. Forge's own option
 * table is not modelled: unknown arguments, including grouped short flags,
 * are forwarded and Forge reports anything malformed.
 */
export function parseForgeArgs(
  spec: CommandSpec,
  args: string[],
  validate: Validate = (_name, value) => value,
): ParsedArgs {
  const parsed: ParsedArgs = { owned: {}, forwarded: [], help: false };
  const pending = [...args];
  while (pending.length && !parsed.help) {
    const arg = pending.shift() as string;
    if (arg === "--") {
      parsed.forwarded.push(arg, ...pending);
      break;
    }
    const match = ownedName(spec, arg);
    if (!match) {
      if (spec.help.includes(arg)) parsed.help = true;
      else parsed.forwarded.push(arg);
      continue;
    }
    if (Object.hasOwn(parsed.owned, match.name))
      throw new UsageError(
        `Duplicate option: --${match.name}; supply it only once`,
      );
    parsed.owned[match.name] = validate(
      match.name,
      match.value ?? pending.shift() ?? "",
    );
  }
  return parsed;
}
