import { expect, test } from "bun:test";
import { existsSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { root, useBuiltCli } from "./support/cli.ts";
import { packedConsumer } from "./support/consumer.ts";
import {
  deploymentEnv,
  realSecretSpec,
  type ToolCall,
} from "./support/fixtures.ts";

useBuiltCli();

test("installed package exposes discovery without tools or configuration", async () => {
  const project = await packedConsumer();
  const bin = join(project, "node_modules", ".bin", "fence-rider");
  expect(existsSync(bin)).toBe(true);
  const { version } = await Bun.file(join(root, "package.json")).json();
  for (const args of [[], ["--help"], ["--version"], ["unsupported"]]) {
    const child = Bun.spawn([bin, ...args], {
      cwd: project,
      env: {
        PATH: process.execPath.slice(0, process.execPath.lastIndexOf("/")),
        HOME: project,
      },
      stdout: "pipe",
      stderr: "pipe",
    });
    const [status, stdout, stderr] = await Promise.all([
      child.exited,
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
    ]);
    expect(status).toBe(args[0] === "unsupported" ? 1 : 0);
    expect(stdout + stderr).toContain(
      args[0] === "--version"
        ? `fence-rider ${version}`
        : args[0] === "unsupported"
          ? "Unknown command"
          : "Usage: fence-rider",
    );
  }
});

test("installed configured invocation rejects a missing SecretSpec before Forge runs", async () => {
  const project = await packedConsumer();
  rmSync(join(project, "bin/secretspec"));
  const child = Bun.spawn([process.execPath, "run", "forge:lint"], {
    cwd: project,
    env: {
      ...deploymentEnv(project, {}),
      PATH: `${join(project, "bin")}:${process.execPath.slice(0, process.execPath.lastIndexOf("/"))}`,
    },
    stdout: "pipe",
    stderr: "pipe",
  });
  const [status, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  expect(status).toBe(1);
  expect(stdout + stderr).toContain("secretspec prerequisite");
  expect(existsSync(join(project, "tool-calls"))).toBe(false);
});

test.skipIf(!realSecretSpec)(
  "installed consumer runs configured lint against the native SecretSpec on PATH",
  async () => {
    const project = await packedConsumer();
    writeFileSync(
      join(project, "secretspec.toml"),
      `[project]\nname = "consumer"\nrevision = "1.0"\n[profiles.default]\nFORGE_ENVIRONMENT = { description = "Target", default = "development" }\nFORGE_SITE = { description = "Site", default = "synthetic.atlassian.net" }\nFORGE_PRODUCT = { description = "Product", default = "jira" }\n`,
    );
    writeFileSync(join(project, "values.env"), "");
    const child = Bun.spawn([process.execPath, "run", "forge:lint"], {
      cwd: project,
      env: {
        ...deploymentEnv(project, {
          realSecretSpec: realSecretSpec ?? "",
          schema: {
            properties: {
              FORGE_ENVIRONMENT: {},
              FORGE_SITE: {},
              FORGE_PRODUCT: {},
            },
          },
        }),
        PATH: `${join(project, "bin")}:${process.execPath.slice(0, process.execPath.lastIndexOf("/"))}`,
        SECRETSPEC_PROVIDER: "dotenv:values.env",
      },
      stdout: "pipe",
      stderr: "pipe",
    });
    const [status, stdout, stderr] = await Promise.all([
      child.exited,
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
    ]);
    expect({ status, stdout, stderr }).toEqual({
      status: 0,
      stdout: "synthetic lint result\n",
      stderr: "$ fence-rider lint\nsynthetic lint warning\n",
    });
    const calls = (await Bun.file(join(project, "tool-calls")).text())
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    expect(calls.filter(({ tool }) => tool === "forge")).toEqual([
      {
        tool: "forge",
        args: ["lint"],
        values: {
          FORGE_ENVIRONMENT: "development",
          FORGE_SITE: "synthetic.atlassian.net",
          FORGE_PRODUCT: "jira",
        },
      },
    ]);
  },
);

test.skipIf(!realSecretSpec)(
  "documented installed consumer deploy script resolves shared values and preserves approval policy",
  async () => {
    const example = await Bun.file(
      join(root, "docs/examples/package.json"),
    ).json();
    const project = await packedConsumer();
    writeFileSync(join(project, "package.json"), JSON.stringify(example));
    for (const name of ["secretspec.toml", "manifest.yml", "values.env"])
      writeFileSync(
        join(project, name),
        await Bun.file(join(root, "docs/examples", name)).text(),
      );
    const options = {
      schema: {
        properties: {
          FORGE_ENVIRONMENT: {},
          FORGE_SITE: {},
          FORGE_PRODUCT: {},
          LOCAL_ONLY: {},
          MANIFEST_INPUT: {},
          RUNTIME_ONLY: {},
          SHARED: {},
          OPTIONAL: {},
        },
      },
    };
    const child = Bun.spawn([process.execPath, "run", "deploy"], {
      cwd: project,
      env: {
        ...deploymentEnv(project, {
          ...options,
          realSecretSpec: realSecretSpec ?? "",
        }),
        PATH: `${join(project, "bin")}:${process.execPath.slice(0, process.execPath.lastIndexOf("/"))}`,
        SECRETSPEC_PROVIDER: "dotenv:values.env",
        OPTIONAL: "stale",
      },
      stdout: "pipe",
      stderr: "pipe",
    });
    const [status, stdout, stderr] = await Promise.all([
      child.exited,
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
    ]);
    expect(status, stdout + stderr).toBe(0);
    const calls: ToolCall[] = (
      await Bun.file(join(project, "tool-calls")).text()
    )
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line))
      .filter(({ tool }: ToolCall) => tool === "forge");
    expect(calls.map(({ args }) => args)).toEqual([
      [
        "variables",
        "set",
        "--encrypt",
        "--environment",
        "development",
        "RUNTIME_ONLY",
        "synthetic-runtime",
      ],
      [
        "variables",
        "set",
        "--encrypt",
        "--environment",
        "development",
        "SHARED",
        "https://example.com",
      ],
      [
        "deploy",
        "--environment",
        "development",
        "--non-interactive",
        "--approve",
        "MAJOR_VERSION_RULE",
      ],
    ]);
    expect(calls[0]?.values).toEqual({
      FORGE_ENVIRONMENT: "development",
      FORGE_SITE: "synthetic.atlassian.net",
      FORGE_PRODUCT: "jira",
      LOCAL_ONLY: "synthetic-local",
      MANIFEST_INPUT: "https://example.org",
      RUNTIME_ONLY: "synthetic-runtime",
      SHARED: "https://example.com",
    });
    for (const call of calls)
      expect(call.values).toEqual(calls[0]?.values ?? {});
    expect(stdout + stderr).not.toContain("synthetic-runtime");
  },
);

test.skipIf(!realSecretSpec)(
  "documented installed consumer scripts preserve workflow-specific policy without unwanted writes",
  async () => {
    const example = await Bun.file(
      join(root, "docs/examples/package.json"),
    ).json();
    const project = await packedConsumer();
    writeFileSync(join(project, "package.json"), JSON.stringify(example));
    for (const name of ["secretspec.toml", "manifest.yml", "values.env"])
      writeFileSync(
        join(project, name),
        await Bun.file(join(root, "docs/examples", name)).text(),
      );
    const cases = [
      {
        script: "deploy:reviewed",
        expected: [
          "deploy",
          "--environment",
          "development",
          "--non-interactive",
          "--approve",
          "REVIEWED_RULE_FROM_FORGE",
        ],
        uploads: true,
      },
      {
        script: "install:forge",
        expected: [
          "install",
          "--environment",
          "development",
          "--site",
          "synthetic.atlassian.net",
          "--product",
          "jira",
          "--confirm-scopes",
          "--non-interactive",
        ],
      },
      {
        script: "upgrade:forge",
        expected: [
          "install",
          "--environment",
          "development",
          "--site",
          "synthetic.atlassian.net",
          "--product",
          "jira",
          "--upgrade",
          "--confirm-scopes",
          "--non-interactive",
        ],
      },
      {
        script: "uninstall:forge",
        expected: [
          "uninstall",
          "--environment",
          "development",
          "--site",
          "synthetic.atlassian.net",
          "--product",
          "jira",
        ],
      },
      { script: "lint:forge", expected: ["lint"] },
      {
        script: "tunnel",
        expected: ["tunnel", "--environment", "development"],
      },
    ];
    for (const { script, expected, uploads } of cases) {
      const callsFile = join(project, "tool-calls");
      rmSync(callsFile, { force: true });
      const child = Bun.spawn([process.execPath, "run", script], {
        cwd: project,
        env: {
          ...deploymentEnv(project, { realSecretSpec: realSecretSpec ?? "" }),
          PATH: `${join(project, "bin")}:${process.execPath.slice(0, process.execPath.lastIndexOf("/"))}`,
          SECRETSPEC_PROVIDER: "dotenv:values.env",
        },
        stdin: "pipe",
        stdout: "pipe",
        stderr: "pipe",
      });
      child.stdin.write("caller-owned input\n");
      child.stdin.end();
      const [status, stdout, stderr] = await Promise.all([
        child.exited,
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
      ]);
      expect(status, stdout + stderr).toBe(0);
      const calls: ToolCall[] = (await Bun.file(callsFile).text())
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line))
        .filter(({ tool }: ToolCall) => tool === "forge");
      expect(calls.at(-1)?.args).toEqual(expected);
      expect(calls.length).toBe(uploads ? 3 : 1);
      if (script === "tunnel")
        expect(calls[0]?.runtime).toEqual({
          RUNTIME_ONLY: "synthetic-runtime",
          SHARED: "https://example.com",
        });
    }
  },
);

test.skipIf(!realSecretSpec)(
  "installed controls-only consumer uses defaults, overrides and legacy controls without dummy credentials",
  async () => {
    const project = await packedConsumer();
    const example = await Bun.file(
      join(root, "docs/examples/package.json"),
    ).json();
    writeFileSync(join(project, "package.json"), JSON.stringify(example));
    writeFileSync(join(project, "values.env"), "");
    const base =
      '[project]\nname = "controls-only"\nrevision = "1.0"\n[profiles.default]\nFORGE_SITE = { description = "Site", default = "synthetic.atlassian.net" }\nFORGE_PRODUCT = { description = "Product", default = "jira" }\n';
    for (const scenario of [
      {
        script: "deploy",
        declarations: "",
        args: [],
        expected: [
          "deploy",
          "--environment",
          "development",
          "--non-interactive",
          "--approve",
          "MAJOR_VERSION_RULE",
        ],
      },
      {
        script: "install:forge",
        declarations:
          'FORGE_ENV = { description = "Legacy", default = "staging" }\n',
        args: [
          "--site",
          "override.atlassian.net",
          "--product",
          "confluence",
          "--environment",
          "production",
          "--verbose",
        ],
        expected: [
          "install",
          "--environment",
          "production",
          "--site",
          "override.atlassian.net",
          "--product",
          "confluence",
          "--confirm-scopes",
          "--non-interactive",
          "--verbose",
        ],
      },
      {
        script: "tunnel",
        declarations:
          'FORGE_ENV = { description = "Legacy", default = "alice-dev" }\n',
        args: [],
        expected: ["tunnel", "--environment", "alice-dev"],
      },
      {
        script: "lint:forge",
        declarations:
          'FORGE_ENV = { description = "Legacy", default = "staging" }\nFORGE_ENVIRONMENT = { description = "Canonical", default = "production" }\n',
        args: [],
        expected: null,
      },
      {
        script: "uninstall:forge",
        declarations:
          'MISSING = { description = "Full-profile requirement", required = true }\n',
        args: ["--environment", "development"],
        expected: null,
      },
    ]) {
      writeFileSync(
        join(project, "secretspec.toml"),
        base + scenario.declarations,
      );
      const log = join(project, "tool-calls");
      rmSync(log, { force: true });
      const child = Bun.spawn(
        [process.execPath, "run", scenario.script, ...scenario.args],
        {
          cwd: project,
          env: {
            ...deploymentEnv(project, {
              realSecretSpec: realSecretSpec ?? "",
            }),
            PATH: `${join(project, "bin")}:${process.execPath.slice(0, process.execPath.lastIndexOf("/"))}`,
            SECRETSPEC_PROVIDER: "dotenv:values.env",
          },
          stdout: "pipe",
          stderr: "pipe",
        },
      );
      const [status, stdout, stderr] = await Promise.all([
        child.exited,
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
      ]);
      expect(status, stdout + stderr).toBe(scenario.expected ? 0 : 1);
      const calls: ToolCall[] = existsSync(log)
        ? (await Bun.file(log).text())
            .trim()
            .split("\n")
            .map((line) => JSON.parse(line))
            .filter(({ tool }: ToolCall) => tool === "forge")
        : [];
      expect(calls.map(({ args }) => args)).toEqual(
        scenario.expected ? [scenario.expected] : [],
      );
    }
  },
);
