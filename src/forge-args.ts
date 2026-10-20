/** Per-command description of the Forge option table the wrapper must understand. */
export type CommandSpec = {
  /** Options the wrapper owns and re-injects, as name -> short letter (long form is `--name`). */
  owned: Record<string, string>;
  /** Forge options whose payload is always the next argument, even if it looks like a switch. */
  required: string[];
  /** Forge options that take the next argument only when it does not look like a switch. */
  optional: string[];
  /** Flags that request wrapper help instead of running Forge. */
  help: string[];
  /** Boolean short flags that may be grouped in front of a short option (`-fe`). */
  grouped: string;
  /** Options the wrapper refuses to forward. */
  rejected?: RegExp;
};

export type ParsedArgs = {
  owned: Record<string, string>;
  forwarded: string[];
  help: boolean;
};

type Validate = (name: string, value: string) => string;

type Reader = {
  spec: CommandSpec;
  parsed: ParsedArgs;
  pending: string[];
  validate: Validate;
};

/** A short option, possibly preceded by grouped boolean flags: `-fe` + `dev`. */
type Short = { group: string; flag: string; rest: string };

function readShort(spec: CommandSpec, arg: string): Short | undefined {
  const letters = spec.grouped ? `[${spec.grouped}]*` : "";
  const match = new RegExp(`^-(${letters})([^-])(.*)$`, "s").exec(arg);
  if (!match) return undefined;
  return {
    group: match[1] as string,
    flag: `-${match[2]}`,
    rest: match[3] as string,
  };
}

function own(reader: Reader, name: string, value: string | undefined) {
  if (Object.hasOwn(reader.parsed.owned, name))
    throw new Error(`Duplicate option: ${name}`);
  reader.parsed.owned[name] = reader.validate(name, value ?? "");
}

function takeOwned(reader: Reader, arg: string, short?: Short) {
  const { spec, parsed, pending } = reader;
  const names = Object.keys(spec.owned);
  const long = new RegExp(`^--(${names.join("|")})(?:=(.*))?$`, "s").exec(arg);
  if (long) {
    own(reader, long[1] as string, long[2] ?? pending.shift());
    return true;
  }
  const name = names.find((key) => `-${spec.owned[key]}` === short?.flag);
  if (!short || name === undefined) return false;
  if (short.rest.startsWith("=")) throw new Error("Unsupported short equals");
  if (short.group) parsed.forwarded.push(`-${short.group}`);
  own(reader, name, short.rest || pending.shift());
  return true;
}

function takePayload(reader: Reader, arg: string, short?: Short) {
  const { spec, parsed, pending } = reader;
  const flag = short && !short.rest ? short.flag : arg;
  if (spec.required.includes(flag)) {
    parsed.forwarded.push(arg, ...pending.splice(0, 1));
    return true;
  }
  if (!spec.optional.includes(flag)) return false;
  parsed.forwarded.push(arg);
  if (pending[0]?.startsWith("-") === false)
    parsed.forwarded.push(...pending.splice(0, 1));
  return true;
}

function isHelp(spec: CommandSpec, arg: string, short?: Short) {
  return (
    spec.help.includes(arg) ||
    (short?.rest === "" && spec.help.includes(short.flag))
  );
}

function readArgument(reader: Reader, arg: string) {
  const { spec, parsed } = reader;
  if (spec.rejected?.test(arg)) throw new Error("Unsupported option");
  const short = readShort(spec, arg);
  if (takeOwned(reader, arg, short)) return;
  if (isHelp(spec, arg, short)) parsed.help = true;
  else if (!takePayload(reader, arg, short)) parsed.forwarded.push(arg);
}

/**
 * Split Forge arguments into wrapper-owned options and forwarded arguments.
 * Grouped short flags are supported only where the spec lists them; an owned
 * option hidden in a group is lifted out so it cannot bypass target policy.
 */
export function parseForgeArgs(
  spec: CommandSpec,
  args: string[],
  validate: Validate = (_name, value) => value,
): ParsedArgs {
  const parsed: ParsedArgs = { owned: {}, forwarded: [], help: false };
  const reader: Reader = { spec, parsed, pending: [...args], validate };
  while (reader.pending.length && !parsed.help) {
    const arg = reader.pending.shift() as string;
    if (arg === "--") {
      parsed.forwarded.push(arg, ...reader.pending);
      break;
    }
    readArgument(reader, arg);
  }
  return parsed;
}
