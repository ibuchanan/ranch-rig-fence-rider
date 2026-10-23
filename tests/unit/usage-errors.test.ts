import { expect, test } from "bun:test";
import { main } from "../../src/cli";
import { recordingIo } from "../support/main.ts";

const privateValue = "PRIVATE_OPTION_VALUE_do_not_echo";

const invalidOptions = [
  {
    args: ["--environment"],
    cause: "Missing option value",
    recovery: "--environment TARGET",
  },
  { args: ["--environment="], cause: "non-empty", recovery: "--environment" },
  { args: ["-e", ""], cause: "non-empty", recovery: "--environment" },
  {
    args: ["-e", `--${privateValue}`],
    cause: "dash",
    recovery: "--environment",
  },
  {
    args: [`--unknown-${privateValue}`],
    cause: "Unknown wrapper option",
    recovery: "after --",
  },
  {
    args: [privateValue],
    cause: "Unexpected wrapper argument",
    recovery: "after --",
  },
];

test.each(
  ["deploy", "variables", "tunnel"].flatMap((command) =>
    invalidOptions.map((options) => ({ command, ...options })),
  ),
)(
  "$command $args explains the refusal without input values or dependency access",
  async ({ command, args, cause, recovery }) => {
    const { io, stdout, stderr } = recordingIo();
    const accesses: string[] = [];
    io.which = (tool) => {
      accesses.push(tool);
      throw new Error("Unexpected PATH lookup");
    };
    io.readFile = async (path) => {
      accesses.push(path);
      throw new Error("Unexpected file read");
    };
    io.capture = async (tool) => {
      accesses.push(tool);
      throw new Error("Unexpected helper call");
    };

    expect(await main([command, ...args], io)).toBe(1);
    expect(stdout()).toBe("");
    expect(stderr()).toContain(cause);
    expect(stderr()).toContain(recovery);
    expect(stderr()).not.toContain(privateValue);
    expect(accesses).toEqual([]);
  },
);
