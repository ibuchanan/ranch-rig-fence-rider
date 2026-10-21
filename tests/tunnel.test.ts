import { expect, test } from "bun:test";
import { readdirSync } from "node:fs";
import { cli, useBuiltCli, waitUntil } from "./support/cli.ts";
import {
  deploymentEnv,
  deploymentSchema,
  deploymentSpec,
  deploymentValues,
  installationSchema,
  installationSpec,
  installationValues,
  prepareProject,
  runWorkflow,
  sharedValue,
  type WorkflowOptions,
} from "./support/fixtures.ts";

useBuiltCli();

test.each(["FORGE_ENVIRONMENT", "FORGE_SITE", "FORGE_PRODUCT"])(
  "configured tunnel rejects runtime selection of %s",
  async (control) => {
    const result = await runWorkflow({
      command: "tunnel",
      spec: deploymentSpec
        .replace(
          "[profiles.default]",
          `[profiles.default]\n${control === "FORGE_ENVIRONMENT" ? "" : `${control} = { description = "Protected control" }`}`,
        )
        .replace('["SHARED", "OPTIONAL"]', `["SHARED", "${control}"]`),
      schema: {
        ...deploymentSchema,
        properties: {
          ...deploymentSchema.properties,
          [control]: { type: "string" },
        },
      },
      values: {
        ...deploymentValues,
        FORGE_ENVIRONMENT: "development",
        [control]: "development",
      },
    });
    expect(result.exitCode).toBe(1);
    expect(result.interactions.filter(({ tool }) => tool === "forge")).toEqual(
      [],
    );
    expect(result.stderr).toContain("tunnel runtime selection validation");
  },
);

test("configured tunnel normalizes explicit named development override and preserves debug payloads", async () => {
  const args = [
    "-d",
    "-f",
    "index.run",
    "other.run",
    "-h",
    "127.0.0.1",
    "-p",
    "9230",
    "--verbose",
    "--",
    "--environment",
    "production",
  ];
  const result = await runWorkflow({
    command: "tunnel",
    args: ["-ealice-dev", ...args],
  });
  expect(result.exitCode).toBe(0);
  expect(result.interactions.at(-1)?.args).toEqual([
    "tunnel",
    "--environment",
    "alice-dev",
    ...args,
  ]);
});

test("configured tunnel rejects reserved prefix declarations rather than losing local values or bypassing selection", async () => {
  const result = await runWorkflow({
    command: "tunnel",
    args: ["-edevelopment"],
    spec: deploymentSpec.replace(
      "[profiles.default]",
      '[profiles.default]\nFORGE_USER_VAR_LOCAL_ONLY = { description = "Collision" }',
    ),
    schema: {
      ...deploymentSchema,
      properties: {
        ...deploymentSchema.properties,
        FORGE_USER_VAR_LOCAL_ONLY: { type: "string" },
      },
    },
    values: {
      ...deploymentValues,
      FORGE_USER_VAR_LOCAL_ONLY: "synthetic collision",
    },
  });
  expect(result.exitCode).toBe(1);
  expect(result.interactions.filter(({ tool }) => tool === "forge")).toEqual(
    [],
  );
  expect(result.stderr).toContain("tunnel runtime selection validation");
  expect(result.stderr).not.toContain("synthetic collision");
});

test("configured tunnel maps only explicit runtime members from one resolution without writes", async () => {
  const result = await runWorkflow({
    command: "tunnel",
    values: { ...deploymentValues, FORGE_ENVIRONMENT: "development" },
    env: {
      OPTIONAL: "stale",
      FORGE_USER_VAR_SHARED: "stale shared",
      FORGE_USER_VAR_OPTIONAL: "stale optional",
      FORGE_USER_VAR_LOCAL_ONLY: "unauthorized local",
      FORGE_USER_VAR_UNDECLARED: "unauthorized ambient",
    },
  });
  expect(result.exitCode).toBe(0);
  expect(result.interactions.filter(({ tool }) => tool === "forge")).toEqual([
    {
      tool: "forge",
      args: ["tunnel", "--environment", "development"],
      values: { ...deploymentValues, FORGE_ENVIRONMENT: "development" },
      runtime: { SHARED: sharedValue },
    },
  ]);
  expect(result.interactions.map(({ args }) => args[0])).toEqual([
    "schema",
    "export",
    "tunnel",
  ]);
  expect(result.stdout).toContain("synthetic tunnel result");
  expect(result.stderr).toBe("synthetic tunnel warning\n");
  expect(readdirSync(result.project).sort()).toEqual([
    "bin",
    "manifest.yml",
    "secretspec.toml",
    "tool-calls",
  ]);
});

test.each(["lint", "install", "uninstall", "tunnel"] as const)(
  "configured %s streams before exit and inherits input, ordinary settings, and authentication without redaction",
  async (command) => {
    const options: WorkflowOptions = {
      ...(command === "install" || command === "uninstall"
        ? {
            spec: installationSpec,
            schema: installationSchema,
            values: installationValues,
          }
        : {}),
      env: {
        LINT_READ_INPUT: "1",
        ORDINARY_SETTING: "synthetic-setting",
        FORGE_API_TOKEN: "synthetic-auth",
      },
    };
    if (command === "tunnel") options.args = ["-edevelopment"];
    const project = prepareProject(options);
    const child = Bun.spawn(
      [cli.executable, command, ...(options.args ?? [])],
      {
        cwd: project,
        env: deploymentEnv(project, options),
        stdin: "pipe",
        stdout: "pipe",
        stderr: "pipe",
      },
    );
    let stdout = "";
    const output = (async () => {
      for await (const chunk of child.stdout)
        stdout += new TextDecoder().decode(chunk);
    })();
    const errors = new Response(child.stderr).text();
    try {
      await waitUntil(
        () => stdout.includes(`synthetic ${command} result`),
        `live ${command} output before input`,
      );
      expect(child.exitCode).toBeNull();
      child.stdin.write(sharedValue);
      child.stdin.end();
      expect(await child.exited).toBe(0);
      await output;
      expect(stdout).toContain(`input:${sharedValue}`);
      expect(stdout).toContain("ordinary:synthetic-setting");
      expect(stdout).toContain("auth:synthetic-auth");
      expect(await errors).toBe(`synthetic ${command} warning\n`);
    } finally {
      child.stdin.end();
      child.kill("SIGKILL");
      await child.exited;
      await output;
      await errors;
    }
  },
);

test.each([
  { args: ["-e", "--verbose"] },
  { args: ["-edevelopment", "--environment", "development"] },
])(
  "configured tunnel rejects invalid or duplicate targets %j before tools",
  async ({ args }) => {
    const result = await runWorkflow({ command: "tunnel", args });
    expect(result.exitCode).toBe(1);
    expect(result.interactions).toEqual([]);
    expect(result.stderr).toContain("tunnel option validation");
  },
);

test.each([""])(
  "configured tunnel rejects empty configured target %j",
  async (target) => {
    const result = await runWorkflow({
      command: "tunnel",
      values: { ...deploymentValues, FORGE_ENVIRONMENT: target },
    });
    expect(result.exitCode).toBe(1);
    expect(result.interactions.filter(({ tool }) => tool === "forge")).toEqual(
      [],
    );
    expect(result.stderr).toContain("tunnel target validation");
  },
);
