import { expect, test } from "bun:test";
import { useBuiltCli } from "../support/cli.ts";
import {
  deploymentSchema,
  deploymentSpec,
  realSecretSpec,
  runScript,
} from "../support/fixtures.ts";

useBuiltCli();

test.skipIf(!realSecretSpec).each(["SHARED", "LOCAL_ONLY"])(
  "native lint script fails inside secretspec run for missing whole-profile requirement %s",
  async (missing) => {
    const result = await runScript({
      command: "lint",
      realSecretSpec: realSecretSpec ?? "",
      spec: `${deploymentSpec}\n[scopes.manifest]\nsecrets = ["LOCAL_ONLY"]\n`,
      env: {
        SECRETSPEC_PROVIDER: "dotenv:values.env",
        SECRETSPEC_SCOPE: "manifest",
      },
      dotenv:
        missing === "SHARED"
          ? "LOCAL_ONLY=synthetic-native-local\n"
          : "SHARED=synthetic-native-shared\n",
    });
    expect(result.exitCode).not.toBe(0);
    expect(result.interactions.filter(({ tool }) => tool === "forge")).toEqual(
      [],
    );
    expect(result.stderr).toContain(missing);
    expect(result.stderr).not.toContain("synthetic-native");
  },
);

test.skipIf(!realSecretSpec)(
  "native lint script delivers the selected profile despite an ambient scope, and leaves an ambient optional visible",
  async () => {
    const spec = `${deploymentSpec.replace("[scopes.runtime]", '[profiles.release]\nLOCAL_ONLY = { description = "Local override", default = "synthetic-release" }\n\n[scopes.runtime]')}\n[scopes.manifest]\nsecrets = ["SHARED"]\n`;
    const result = await runScript({
      command: "lint",
      realSecretSpec: realSecretSpec ?? "",
      spec,
      files: { "selected.toml": spec },
      schema: deploymentSchema,
      env: {
        SECRETSPEC_FILE: "selected.toml",
        SECRETSPEC_PROFILE: "release",
        SECRETSPEC_PROVIDER: "dotenv:values.env",
        SECRETSPEC_SCOPE: "runtime",
        OPTIONAL: "stale",
      },
      dotenv: "SHARED=synthetic-native-shared\n",
    });
    expect(result.exitCode).toBe(0);
    expect(result.interactions.filter(({ tool }) => tool === "forge")).toEqual([
      {
        tool: "forge",
        args: ["lint"],
        values: {
          FORGE_ENVIRONMENT: "staging",
          SHARED: "synthetic-native-shared",
          LOCAL_ONLY: "synthetic-release",
          OPTIONAL: "stale",
        },
      },
    ]);
    const native = result.interactions.filter(
      ({ tool }) => tool === "secretspec",
    );
    expect(native.map(({ args }) => args[0])).toEqual(["run"]);
    expect(native.flatMap(({ args }) => args)).not.toContain("--profile");
  },
);

test.skipIf(!realSecretSpec)(
  "native lint script supports controls-only profiles without target injection or a manifest file",
  async () => {
    const result = await runScript({
      command: "lint",
      realSecretSpec: realSecretSpec ?? "",
      spec: '[project]\nname = "synthetic-lint-controls"\nrevision = "1.0"\n[profiles.default]\nFORGE_ENVIRONMENT = { description = "Target", default = "staging" }\nFORGE_SITE = { description = "Site", default = "synthetic.atlassian.net" }\nFORGE_PRODUCT = { description = "Product", default = "jira" }\n',
      manifest: null,
      schema: {
        properties: {
          FORGE_ENVIRONMENT: {},
          FORGE_SITE: {},
          FORGE_PRODUCT: {},
        },
      },
      env: { SECRETSPEC_PROVIDER: "dotenv:values.env" },
      dotenv: "",
    });
    expect(result.exitCode).toBe(0);
    expect(result.interactions.filter(({ tool }) => tool === "forge")).toEqual([
      {
        tool: "forge",
        args: ["lint"],
        values: {
          FORGE_ENVIRONMENT: "staging",
          FORGE_SITE: "synthetic.atlassian.net",
          FORGE_PRODUCT: "jira",
        },
      },
    ]);
  },
);

test.skipIf(!realSecretSpec).each([
  {
    name: "canonical",
    declarations:
      'FORGE_ENVIRONMENT = { description = "Canonical target", default = "staging" }',
    env: {},
    target: "staging",
    args: [],
  },
  {
    name: "canonical override",
    declarations:
      'FORGE_ENVIRONMENT = { description = "Canonical target", default = "staging" }',
    env: {},
    target: "production",
    args: ["--environment", "production"],
  },
  {
    name: "unresolved optional target keeps the exported value",
    declarations:
      'FORGE_ENVIRONMENT = { description = "Optional target", required = false }',
    env: { FORGE_ENVIRONMENT: "stale-production" },
    target: "stale-production",
    args: [],
  },
])(
  "native controls-only profile: $name deploys via one secretspec run without writes",
  async ({ declarations, env, target, args }) => {
    const result = await runScript({
      command: "deploy",
      realSecretSpec: realSecretSpec ?? "",
      spec: `[project]\nname = "synthetic-controls"\nrevision = "1.0"\n[profiles.default]\n${declarations}\n`,
      schema: { properties: { FORGE_ENVIRONMENT: {} } },
      env: { SECRETSPEC_PROVIDER: "dotenv:values.env", ...env },
      dotenv: "",
      generate: args,
    });
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toContain("synthetic deploy warning");
    const forge = result.interactions.filter(({ tool }) => tool === "forge");
    expect(forge.map(({ args }) => args)).toEqual([
      ["deploy", "--environment", target],
    ]);
    expect(
      result.interactions
        .filter(({ tool }) => tool === "secretspec")
        .map(({ args }) => args[0]),
    ).toEqual(["run"]);
  },
);
