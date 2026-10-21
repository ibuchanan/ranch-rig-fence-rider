import { expect, test } from "bun:test";
import { existsSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { root, useBuiltCli } from "../../support/cli.ts";
import { once, packedConsumer } from "../../support/consumer.ts";
import {
  deploymentEnv,
  realSecretSpec,
  type ToolCall,
} from "../../support/fixtures.ts";

useBuiltCli();

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
    expect({ status, stdout }).toEqual({
      status: 0,
      stdout: "synthetic lint result\n",
    });
    expect(stderr).toStartWith(
      '$ cmd=$(fence-rider lint) && sh -c "$cmd" sh\n',
    );
    expect(stderr).toContain("synthetic lint warning\n");
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
  "documented installed consumer release script uploads runtime variables, then deploys, resolving shared values and preserving approval policy",
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
    const child = Bun.spawn([process.execPath, "run", "release"], {
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
    expect(calls.slice(0, -1).map(({ values }) => values)).toEqual(
      calls.slice(0, -1).map(() => calls[0]?.values ?? {}),
    );
    // Deploy runs under `secretspec run`, which leaves the unresolved optional's exported value visible.
    expect(calls.at(-1)?.values).toEqual({
      ...calls[0]?.values,
      OPTIONAL: "stale",
    });
    expect(stdout + stderr).not.toContain("synthetic-runtime");
  },
);

const documentedConsumer = once(async () => {
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
  return project;
});

const documentedScripts: {
  script: string;
  expected: string[];
  count?: number;
}[] = [
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
  },
  {
    script: "variables",
    expected: [
      "variables",
      "set",
      "--encrypt",
      "--environment",
      "development",
      "SHARED",
      "https://example.com",
    ],
    count: 2,
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

test.skipIf(!realSecretSpec).each(documentedScripts)(
  "documented installed consumer script $script preserves workflow-specific policy; only variables uploads",
  async ({ script, expected, count = 1 }) => {
    const project = await documentedConsumer();
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
    expect(calls.length).toBe(count);
    if (script === "tunnel")
      expect(calls[0]?.runtime).toEqual({
        RUNTIME_ONLY: "synthetic-runtime",
        SHARED: "https://example.com",
      });
  },
);

const controlsOnlyConsumer = once(async () => {
  const project = await packedConsumer();
  const example = await Bun.file(
    join(root, "docs/examples/package.json"),
  ).json();
  writeFileSync(join(project, "package.json"), JSON.stringify(example));
  writeFileSync(join(project, "values.env"), "");
  return project;
});

const controlsOnlyBase =
  '[project]\nname = "controls-only"\nrevision = "1.0"\n[profiles.default]\nFORGE_SITE = { description = "Site", default = "synthetic.atlassian.net" }\nFORGE_PRODUCT = { description = "Product", default = "jira" }\n';

const controlsOnlyScenarios: {
  script: string;
  declarations: string;
  args: string[];
  expected: string[] | null;
}[] = [
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
      'FORGE_ENVIRONMENT = { description = "Target", default = "staging" }\n',
    args: ["--verbose"],
    expected: [
      "install",
      "--environment",
      "staging",
      "--site",
      "synthetic.atlassian.net",
      "--product",
      "jira",
      "--confirm-scopes",
      "--non-interactive",
      "--verbose",
    ],
  },
  {
    script: "install:forge",
    declarations: "",
    // The generator refuses target options only when given to fence-rider;
    // what a script runner appends goes to Forge after the injected targets.
    args: ["--site", "override.atlassian.net"],
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
      "--site",
      "override.atlassian.net",
    ],
  },
  {
    script: "tunnel",
    declarations:
      'FORGE_ENVIRONMENT = { description = "Target", default = "alice-dev" }\n',
    args: [],
    expected: ["tunnel", "--environment", "alice-dev"],
  },
  {
    script: "uninstall:forge",
    declarations:
      'MISSING = { description = "Full-profile requirement", required = true }\n',
    args: [],
    expected: null,
  },
];

test.skipIf(!realSecretSpec).each(controlsOnlyScenarios)(
  "installed controls-only consumer runs $script $args with defaults and no dummy credentials",
  async (scenario) => {
    const project = await controlsOnlyConsumer();
    writeFileSync(
      join(project, "secretspec.toml"),
      controlsOnlyBase + scenario.declarations,
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
  },
);
