import { expect, test } from "bun:test";
import { type CommandSpec, parseForgeArgs } from "../src/forge-args";

const spec: CommandSpec = {
  owned: { environment: "e", site: "s" },
  required: ["--tag", "-t"],
  optional: ["--host", "-p"],
  help: ["--help", "-h"],
  grouped: "fd",
};

test("owned options accept separated, long-equals and attached-short values", () => {
  for (const args of [
    ["--environment", "dev"],
    ["--environment=dev"],
    ["-edev"],
    ["-e", "dev"],
  ])
    expect(parseForgeArgs(spec, args).owned).toEqual({ environment: "dev" });
});

test("grouped boolean flags before an owned short option stay forwarded", () => {
  expect(parseForgeArgs(spec, ["-fdedev", "--x"])).toEqual({
    owned: { environment: "dev" },
    forwarded: ["-fd", "--x"],
    help: false,
  });
});

test("a repeated owned option fails even in a different spelling", () => {
  expect(() => parseForgeArgs(spec, ["-edev", "--environment", "x"])).toThrow(
    "Duplicate",
  );
});

test("a short equals value for an owned option is rejected", () => {
  expect(() => parseForgeArgs(spec, ["-e=dev"])).toThrow("short equals");
});

test("required values consume switch-looking payloads; optional values do not", () => {
  expect(
    parseForgeArgs(spec, ["--tag", "--help", "-fp", "-e"]).forwarded,
  ).toEqual(["--tag", "--help", "-fp"]);
  expect(parseForgeArgs(spec, ["-p", "v", "-ft", "--help"])).toEqual({
    owned: {},
    forwarded: ["-p", "v", "-ft", "--help"],
    help: false,
  });
});

test("help flags, including grouped short help, stop parsing", () => {
  for (const args of [["--help", "-e"], ["-fh"], ["-h", "--environment"]])
    expect(parseForgeArgs(spec, args).help).toBe(true);
});

test("everything after the terminator is forwarded untouched", () => {
  expect(parseForgeArgs(spec, ["-edev", "--", "-h", "-esite"])).toEqual({
    owned: { environment: "dev" },
    forwarded: ["--", "-h", "-esite"],
    help: false,
  });
});

test("rejected options fail before being forwarded", () => {
  const rejecting = { ...spec, rejected: /^--demo$/ };
  expect(() => parseForgeArgs(rejecting, ["--demo"])).toThrow("Unsupported");
});

test("owned values are validated as they are read", () => {
  const validate = (name: string, value: string) => {
    if (value === "bad") throw new Error(`bad ${name}`);
    return value;
  };
  expect(() => parseForgeArgs(spec, ["-s", "bad"], validate)).toThrow(
    "bad site",
  );
});
