import { expect, test } from "bun:test";
import { join } from "node:path";
import { useBuiltCli } from "./support/cli.ts";
import {
  canonicalSchema,
  canonicalSpec,
  deploymentSpec,
  realSecretSpec,
  runWorkflow,
} from "./support/fixtures.ts";

useBuiltCli();

test.skipIf(!realSecretSpec).each(["SHARED", "LOCAL_ONLY"])(
  "native configured lint blocks missing whole-profile requirement %s",
  async (missing) => {
    const result = await runWorkflow({
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
    expect(result.exitCode).toBe(1);
    expect(result.interactions.filter(({ tool }) => tool === "forge")).toEqual(
      [],
    );
    expect(result.stderr).toContain("SecretSpec resolution");
    expect(result.stderr).not.toContain("synthetic-native");
  },
);

test.skipIf(!realSecretSpec)(
  "native configured lint delivers a selected inherited profile, shared manifest value, and cleared optionals once",
  async () => {
    const spec = `${canonicalSpec.replace("[scopes.runtime]", '[profiles.release]\nLOCAL_ONLY = { description = "Local override", default = "synthetic-release" }\n\n[scopes.runtime]')}\n[scopes.manifest]\nsecrets = ["SHARED"]\n`;
    const result = await runWorkflow({
      command: "lint",
      realSecretSpec: realSecretSpec ?? "",
      spec,
      files: { "selected.toml": spec },
      manifest: "environment:\n  variables: [SHARED]\n",
      schema: canonicalSchema,
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
        },
      },
    ]);
    const native = result.interactions.filter(
      ({ tool }) => tool === "secretspec",
    );
    expect(native.map(({ args }) => args[0])).toEqual(["schema", "export"]);
    for (const { args } of native) {
      expect(args.slice(1, 5)).toEqual([
        "--file",
        join(result.project, "selected.toml"),
        "--profile",
        "release",
      ]);
    }
  },
);

test.skipIf(!realSecretSpec)(
  "native configured lint supports controls-only profiles without target injection or manifest file",
  async () => {
    const result = await runWorkflow({
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
    name: "legacy",
    declarations:
      'FORGE_ENV = { description = "Legacy target", default = "staging" }',
    env: {},
    target: "staging",
    args: [],
  },
  {
    name: "matching dual",
    declarations:
      'FORGE_ENVIRONMENT = { description = "Canonical target", default = "staging" }\nFORGE_ENV = { description = "Legacy target", default = "staging" }',
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
    name: "absent canonical clears stale ambient target",
    declarations:
      'FORGE_ENVIRONMENT = { description = "Optional target", required = false }',
    env: { FORGE_ENVIRONMENT: "stale-production" },
    target: "development",
    args: [],
  },
])(
  "native controls-only profile: $name deploys without writes",
  async ({ declarations, env, target, args }) => {
    const result = await runWorkflow({
      realSecretSpec: realSecretSpec ?? "",
      spec: `[project]\nname = "synthetic-controls"\nrevision = "1.0"\n[profiles.default]\n${declarations}\n`,
      schema: { properties: { FORGE_ENVIRONMENT: {}, FORGE_ENV: {} } },
      env: { SECRETSPEC_PROVIDER: "dotenv:values.env", ...env },
      dotenv: "",
      args,
    });
    expect({ exitCode: result.exitCode, stderr: result.stderr }).toEqual({
      exitCode: 0,
      stderr: "",
    });
    const forge = result.interactions.filter(({ tool }) => tool === "forge");
    expect(forge.map(({ args }) => args)).toEqual([
      ["deploy", "--environment", target],
    ]);
    expect(forge[0]?.values).not.toHaveProperty(
      "FORGE_ENVIRONMENT",
      "stale-production",
    );
    expect(
      result.interactions
        .filter(({ tool }) => tool === "secretspec")
        .map(({ args }) => args[0]),
    ).toEqual(["schema", "export"]);
  },
);
