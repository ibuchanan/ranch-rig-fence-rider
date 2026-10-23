import { expect, test } from "bun:test";
import { runMain } from "../support/main.ts";
import { runInProcess } from "../support/fake-io.ts";

const spellings = [
  ["--environment", "dev"],
  ["--environment=dev"],
  ["-edev"],
  ["-e", "dev"],
];
test.each(spellings.map((args) => ({ args })))(
  "Commander environment spelling $args",
  async ({ args }) => {
    const result = await runMain(["deploy", ...args]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("environment=dev\n");
  },
);

test("repeated scalar options use the last value", async () => {
  const result = await runMain(["deploy", "-edev", "--environment", "staging"]);
  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain("environment=staging\n");
  expect(result.stdout).not.toContain("environment=dev\n");
});

test("Commander short equals is a literal attached value", async () => {
  const result = await runMain(["deploy", "-e=dev"]);
  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain("environment==dev\n");
});

test("the handoff consumes one separator and preserves all Forge words including nested --", async () => {
  const result = await runMain([
    "deploy",
    "-edev",
    "--",
    "-fdedev",
    "--tag",
    "x y",
    "--help",
    "--",
    "-esite",
  ]);
  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain("environment=dev\n");
  expect(result.stdout).toEndWith(
    `' sh deploy -fdedev --tag 'x y' --help -- -esite "$@"\n`,
  );
});

test.each(["lint", "install", "uninstall", "deploy"])(
  "%s forwards explicit Forge help instead of showing wrapper help",
  async (command) => {
    const result = await runMain([command, "--", "--help"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("exec secretspec run");
    expect(result.stdout).toContain(` ${command} --help "$@"`);
    expect(result.stdout).not.toContain("Usage:");
  },
);

test("tunnel -h is wrapper help; -- -h HOST is a Forge debug host", async () => {
  const help = await runMain(["tunnel", "-h"]);
  expect(help.exitCode).toBe(0);
  expect(help.stdout).toStartWith("Usage: fence-rider tunnel");
  const result = await runInProcess({
    command: "tunnel",
    args: ["-edevelopment", "--", "-h", "127.0.0.1", "-d", "--help"],
  });
  expect(result.exitCode).toBe(0);
  expect(result.stdout).toEndWith(`' sh tunnel -h 127.0.0.1 -d --help "$@"\n`);
});

test.each(["variables", "doctor"])(
  "%s refuses Forge arguments without tool access",
  async (command) => {
    const result = await runMain([command, "--", "--help"]);
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("Forge arguments are not accepted");
  },
);

test.each(["variables", "tunnel"])(
  "%s uses the final repeated target",
  async (command) => {
    const result = await runInProcess({
      command,
      args: ["-eproduction", "--environment", "development"],
    });
    expect(result.exitCode).toBe(0);
    if (command === "tunnel")
      expect(result.stdout).toContain("environment=development\n");
    else
      expect(
        result.interactions
          .filter(({ tool }) => tool === "forge")
          .map(({ args }) => args[4]),
      ).toEqual(["development"]);
  },
);
