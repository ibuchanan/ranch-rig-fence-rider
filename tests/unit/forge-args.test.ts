import { expect, test } from "bun:test";
import { type CommandSpec, parseForgeArgs } from "../../src/forge-args";

const spec: CommandSpec = {
  owned: { environment: "e", site: "s" },
  help: ["--help", "-h"],
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

test("Forge options, including grouped short flags, are forwarded unparsed", () => {
  expect(parseForgeArgs(spec, ["-fdedev", "--tag", "x", "-v"])).toEqual({
    owned: {},
    forwarded: ["-fdedev", "--tag", "x", "-v"],
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

test("help flags stop parsing", () => {
  for (const args of [
    ["--help", "-e"],
    ["-h", "--environment"],
  ])
    expect(parseForgeArgs(spec, args).help).toBe(true);
});

test("everything after the terminator is forwarded untouched", () => {
  expect(parseForgeArgs(spec, ["-edev", "--", "-h", "-esite"])).toEqual({
    owned: { environment: "dev" },
    forwarded: ["--", "-h", "-esite"],
    help: false,
  });
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
