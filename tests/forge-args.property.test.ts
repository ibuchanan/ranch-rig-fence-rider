import { expect, test } from "bun:test";
import fc from "fast-check";
import { type CommandSpec, parseForgeArgs } from "../src/forge-args";

const spec: CommandSpec = {
  owned: { environment: "e", site: "s" },
  required: ["--tag", "-t"],
  optional: ["--host", "-p"],
  help: ["--help", "-h"],
  grouped: "fd",
};

// Words that no option table treats specially.
const word = fc.stringMatching(/^[a-z][a-z0-9]{0,7}$/);
// Any payload an owned option may carry, including switch-looking and empty ones.
const anyValue = fc.string();
// Short attached values cannot start with "=", which is rejected as short equals.
const attachedValue = fc
  .string({ minLength: 1 })
  .filter((value) => !value.startsWith("="));

const spellings = {
  separated: (value: string) => ["--environment", value],
  equals: (value: string) => [`--environment=${value}`],
  shortSeparated: (value: string) => ["-e", value],
  shortAttached: (value: string) => [`-e${value}`],
};
const spelling = fc.constantFrom(...Object.values(spellings));

test("every spelling of an owned option yields the same value", () => {
  fc.assert(
    fc.property(attachedValue, (value) => {
      for (const spell of Object.values(spellings))
        expect(parseForgeArgs(spec, spell(value)).owned).toEqual({
          environment: value,
        });
    }),
  );
  fc.assert(
    fc.property(anyValue, (value) => {
      for (const spell of [spellings.separated, spellings.equals])
        expect(parseForgeArgs(spec, spell(value))).toEqual({
          owned: { environment: value },
          forwarded: [],
          help: false,
        });
    }),
  );
});

test("a grouped boolean prefix is forwarded while the owned value is lifted out", () => {
  fc.assert(
    fc.property(
      fc.stringMatching(/^[fd]{1,3}$/),
      attachedValue,
      (group, value) => {
        expect(parseForgeArgs(spec, [`-${group}e${value}`])).toEqual({
          owned: { environment: value },
          forwarded: [`-${group}`],
          help: false,
        });
      },
    ),
  );
});

test("an owned option repeated in any two spellings fails", () => {
  fc.assert(
    fc.property(
      spelling,
      spelling,
      attachedValue,
      attachedValue,
      (first, second, a, b) => {
        expect(() => parseForgeArgs(spec, [...first(a), ...second(b)])).toThrow(
          "Duplicate",
        );
      },
    ),
  );
});

test("everything after the terminator is forwarded untouched", () => {
  fc.assert(
    fc.property(fc.array(word), fc.array(fc.string()), (before, after) => {
      expect(parseForgeArgs(spec, [...before, "--", ...after])).toEqual({
        owned: {},
        forwarded: [...before, "--", ...after],
        help: false,
      });
    }),
  );
});

test("a help flag stops parsing whatever follows it", () => {
  fc.assert(
    fc.property(
      fc.array(word),
      fc.constantFrom("--help", "-h", "-fh", "-dfh"),
      fc.array(fc.string()),
      (before, help, after) => {
        expect(parseForgeArgs(spec, [...before, help, ...after])).toEqual({
          owned: {},
          forwarded: before,
          help: true,
        });
      },
    ),
  );
});

// Tokens without required or optional payload flags, so every forwarded token
// before the terminator is a plain argument and the leak check needs no model
// of payload consumption.
const ownedSpelling = /^(--(environment|site)(=|$)|-[fd]*[es])/;
const token = fc.oneof(
  word,
  fc.constantFrom(
    "--environment",
    "--site",
    "--environment=x",
    "--site=y",
    "-e",
    "-s",
    "-fe",
    "-dfs",
    "-ex",
    "-sy",
    "-f",
    "-xe",
    "--x",
  ),
);

test("no owned option is ever forwarded to Forge", () => {
  fc.assert(
    fc.property(fc.array(token), (args) => {
      let parsed: ReturnType<typeof parseForgeArgs>;
      try {
        parsed = parseForgeArgs(spec, args);
      } catch {
        return; // duplicates are rejected, which is also not a leak
      }
      for (const arg of parsed.forwarded)
        expect(arg).not.toMatch(ownedSpelling);
    }),
    { numRuns: 500 },
  );
});
