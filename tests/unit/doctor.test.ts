import { basename } from "node:path";
import { expect, test } from "bun:test";
import { main } from "../../src/cli";
import type { Io } from "../../src/io";
import { CommandFailure } from "../../src/process";
import { recordingIo } from "../support/main.ts";

type Tools = Record<string, string | null>;

type Project = {
  /** Printed by a fake `secretspec check --json --scope manifest`; "fail" exits 1 as for an undefined scope. */
  report?: string[] | "fail";
  /** The manifest.yml in the project, when it has one. */
  manifest?: string;
};

/** Run `doctor` in-process against fake tools whose `--version` prints the given text (null: tool absent). */
async function runDoctor(
  tools: Tools,
  args: string[] = [],
  toml?: string,
  project: Project = {},
) {
  const recorded = recordingIo();
  const io: Io = {
    ...recorded.io,
    env: {},
    which: (tool) => (tools[tool] ? `/fake/bin/${tool}` : null),
    readFile: async (path) => {
      if (path.endsWith("secretspec.toml") && toml !== undefined) return toml;
      if (path.endsWith("manifest.yml") && project.manifest !== undefined)
        return project.manifest;
      throw new Error(`ENOENT: no such file or directory, open '${path}'`);
    },
    capture: async (path, callArgs) => {
      const { report } = project;
      if (callArgs[0] === "check" && report !== undefined) {
        if (report === "fail")
          throw new CommandFailure("exit status 1", 1, "Invalid scope");
        return JSON.stringify({
          schema_version: 1,
          scope: "manifest",
          secrets: report.map((name) => ({ name, status: "resolved" })),
        });
      }
      return `${tools[basename(path)]}\n`;
    },
  };
  const exitCode = await main(["doctor", ...args], io);
  return { exitCode, stdout: recorded.stdout(), stderr: recorded.stderr() };
}

test("doctor passes when both tools are within the tested range", async () => {
  const result = await runDoctor({
    secretspec: "secretspec 0.21.1",
    forge: "14.2.0",
  });
  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain("SecretSpec: 0.21.1 ok");
  expect(result.stdout).toContain("Forge CLI: 14.2.0 ok");
  expect(result.stdout).toContain("supported from 0.17.0, tested through");
});

test("doctor warns about newer versions without failing", async () => {
  const result = await runDoctor({
    secretspec: "secretspec 99.0.0",
    forge: "99.1",
  });
  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain("SecretSpec: 99.0.0 untested");
  expect(result.stdout).toContain("Forge CLI: 99.1 untested");
});

test("doctor fails for a version older than supported", async () => {
  const result = await runDoctor({
    secretspec: "secretspec 0.16.9",
    forge: "14.2.0",
  });
  expect(result.exitCode).toBe(1);
  expect(result.stdout).toContain("SecretSpec: 0.16.9 unsupported");
  expect(result.stdout).toContain("Forge CLI: 14.2.0 ok");
});

test("doctor fails for a missing tool and still reports the other", async () => {
  const result = await runDoctor({ secretspec: null, forge: "14.2.0" });
  expect(result.exitCode).toBe(1);
  expect(result.stdout).toContain("SecretSpec: not found on PATH");
  expect(result.stdout).toContain("Forge CLI: 14.2.0 ok");
});

test("doctor fails when a version cannot be read", async () => {
  const result = await runDoctor({
    secretspec: "secretspec dev build",
    forge: "14.2.0",
  });
  expect(result.exitCode).toBe(1);
  expect(result.stdout).toContain("SecretSpec: no version found unreadable");
});

test("doctor accepts no arguments", async () => {
  const result = await runDoctor({}, ["--verbose"]);
  expect(result.exitCode).toBe(1);
  expect(result.stderr).toContain("Unknown command or unsupported arguments");
});

const spec = (scopes: string) =>
  `[project]\nname = "x"\nrevision = "1.0"\n[profiles.default]\nA = { description = "a" }\n${scopes}`;
const ok = { secretspec: "secretspec 0.21.1", forge: "14.2.0" };

test("doctor skips the scope check without a SecretSpec file", async () => {
  const result = await runDoctor(ok);
  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain("scope check skipped");
});

test("doctor accepts the recognized scopes", async () => {
  const result = await runDoctor(
    ok,
    [],
    spec(
      '[scopes.manifest]\nsecrets = ["A"]\n[scopes.runtime]\nsecrets = ["A"]\n',
    ),
    { report: ["A"], manifest: "environment:\n  variables: [A]\n" },
  );
  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain("scopes ok");
});

test("doctor warns about a scope Fence Rider never reads without failing", async () => {
  const result = await runDoctor(
    ok,
    [],
    spec('[scopes.runtim]\nsecrets = ["A"]\n'),
  );
  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain(
    'scope "runtim" is not read by Fence Rider (recognized: manifest, runtime)',
  );
});

test("doctor warns and skips the scope check when the file cannot be parsed", async () => {
  const result = await runDoctor(ok, [], "not valid TOML = [");
  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain("missing or unparsable; scope check skipped");
});

const manifestSpec = spec('[scopes.manifest]\nsecrets = ["A", "B"]\n');

test("doctor skips the manifest check when there is no manifest scope", async () => {
  const result = await runDoctor(ok, [], spec(""), { report: "fail" });
  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain("Manifest: no manifest scope; check skipped");
});

test("doctor skips the manifest check without a SecretSpec file", async () => {
  const result = await runDoctor(ok, [], undefined, { report: "fail" });
  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain("Manifest: no manifest scope; check skipped");
});

test("doctor passes when every manifest scope member is declared in manifest.yml", async () => {
  const result = await runDoctor(ok, [], manifestSpec, {
    report: ["A", "B"],
    manifest:
      "environment:\n  variables:\n    - A\n    - key: B\n      default: x\n",
  });
  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain(
    "Manifest: manifest scope members are declared in manifest.yml",
  );
});

test("doctor fails and names the manifest member that is not declared", async () => {
  const result = await runDoctor(ok, [], manifestSpec, {
    report: ["A", "B"],
    manifest: "environment:\n  variables: [A]\n",
  });
  expect(result.exitCode).toBe(1);
  expect(result.stdout).toContain(
    "Manifest: manifest declaration for B failed",
  );
});

test("doctor fails when manifest scope members exist but manifest.yml is missing", async () => {
  const result = await runDoctor(ok, [], manifestSpec, { report: ["A"] });
  expect(result.exitCode).toBe(1);
  expect(result.stdout).toContain("Manifest: manifest validation failed");
});

test("doctor needs no manifest.yml when the manifest scope has no members", async () => {
  const result = await runDoctor(ok, [], manifestSpec, { report: [] });
  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain(
    "Manifest: manifest scope members are declared",
  );
});

test("doctor fails privately when the scope check itself fails", async () => {
  const result = await runDoctor(ok, [], manifestSpec, { report: "fail" });
  expect(result.exitCode).toBe(1);
  expect(result.stdout).toContain(
    "Manifest: SecretSpec manifest scope membership failed",
  );
  expect(result.stdout + result.stderr).not.toContain("Invalid scope");
});

test("doctor skips the manifest check when secretspec is missing", async () => {
  const result = await runDoctor(
    { secretspec: null, forge: "14.2.0" },
    [],
    manifestSpec,
    { manifest: "environment:\n  variables: [A]\n" },
  );
  expect(result.exitCode).toBe(1);
  expect(result.stdout).toContain("SecretSpec: not found on PATH");
  expect(result.stdout).toContain("Manifest: no manifest scope; check skipped");
});
