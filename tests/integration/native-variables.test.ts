import { expect, test } from "bun:test";
import { useBuiltCli } from "../support/cli.ts";
import {
  deploymentSchema,
  deploymentSpec,
  realSecretSpec,
  runWorkflow,
  standardSpec,
} from "../support/fixtures.ts";

useBuiltCli();

test.skipIf(!realSecretSpec)(
  "native canonical required control still blocks an explicit target override",
  async () => {
    const result = await runWorkflow({
      realSecretSpec: realSecretSpec ?? "",
      spec: standardSpec
        .modify("FORGE_ENVIRONMENT", { default: undefined, required: true })
        .build(),
      args: ["-e", "production"],
      env: {
        SECRETSPEC_PROVIDER: "dotenv:values.env",
        SECRETSPEC_SCOPE: "runtime",
      },
      dotenv:
        "SHARED=synthetic-native-shared\nLOCAL_ONLY=synthetic-native-local\n",
    });
    expect(result.exitCode).not.toBe(0);
    expect(result.interactions.filter(({ tool }) => tool === "forge")).toEqual(
      [],
    );
    expect(result.stderr).toContain("SecretSpec resolution");
    expect(result.stderr).not.toContain("synthetic-native");
  },
);

test.skipIf(!realSecretSpec)(
  "native SecretSpec schema and full dotenv export share FORGE_ENVIRONMENT values and omit absent optionals",
  async () => {
    const result = await runWorkflow({
      realSecretSpec: realSecretSpec ?? "",
      spec: standardSpec.addScope("manifest", ["SHARED"]).build(),
      manifest: "environment:\n  variables: [SHARED]\n",
      schema: deploymentSchema,
      env: { SECRETSPEC_PROVIDER: "dotenv:values.env" },
      dotenv:
        "SHARED=synthetic-native-shared\nLOCAL_ONLY=synthetic-native-local\n",
    });
    expect(result.exitCode).toBe(0);
    expect(
      result.interactions
        .filter(({ tool }) => tool === "secretspec")
        .map(({ args }) => args.slice(0, 2)),
    ).toEqual([
      ["schema"],
      ["export", "--scope"],
      ["check", "--json"],
      ["check", "--json"],
    ]);
    const forge = result.interactions.filter(({ tool }) => tool === "forge");
    expect(forge.map(({ args }) => args)).toEqual([
      [
        "variables",
        "set",
        "--encrypt",
        "--environment",
        "staging",
        "SHARED",
        "synthetic-native-shared",
      ],
    ]);
    expect(forge.map(({ values }) => values)).toEqual([
      {
        FORGE_ENVIRONMENT: "staging",
        SHARED: "synthetic-native-shared",
        LOCAL_ONLY: "synthetic-native-local",
      },
    ]);
    expect(result.stdout + result.stderr).not.toContain("synthetic-native");
  },
);

test.skipIf(!realSecretSpec)(
  "native full-profile validation blocks uploads when an unscoped requirement is missing",
  async () => {
    const result = await runWorkflow({
      realSecretSpec: realSecretSpec ?? "",
      env: {
        SECRETSPEC_PROVIDER: "dotenv:values.env",
        SECRETSPEC_SCOPE: "runtime",
      },
      dotenv: "SHARED=synthetic-native-shared\n",
    });
    expect(result.exitCode).not.toBe(0);
    expect(result.interactions.filter(({ tool }) => tool === "forge")).toEqual(
      [],
    );
    expect(
      result.interactions
        .filter(({ tool }) => tool === "secretspec")
        .map(({ args }) => args[0]),
    ).toEqual(["schema", "export"]);
    expect(result.stderr).toContain("SecretSpec resolution");
    expect(result.stdout + result.stderr).not.toContain("synthetic-native");
  },
);

test.skipIf(!realSecretSpec)(
  "native profile selection through SECRETSPEC_PROFILE applies to the whole resolution",
  async () => {
    const result = await runWorkflow({
      realSecretSpec: realSecretSpec ?? "",
      spec: standardSpec
        .profile("release", {
          FORGE_ENVIRONMENT: {
            description: "Release target",
            default: "production",
          },
        })
        .build(),
      env: {
        SECRETSPEC_PROVIDER: "dotenv:values.env",
        SECRETSPEC_PROFILE: "release",
      },
      dotenv: "SHARED=synthetic-release\nLOCAL_ONLY=synthetic-local\n",
    });
    expect(result.exitCode).toBe(0);
    const native = result.interactions.filter(
      ({ tool }) => tool === "secretspec",
    );
    expect(native.map(({ args }) => args[0])).toEqual([
      "schema",
      "export",
      "check",
      "check",
    ]);
    expect(native.flatMap(({ args }) => args)).not.toContain("--profile");
    expect(result.interactions.at(-1)?.values).toEqual({
      FORGE_ENVIRONMENT: "production",
      SHARED: "synthetic-release",
      LOCAL_ONLY: "synthetic-local",
    });
  },
);

test.skipIf(!realSecretSpec)(
  "native standalone profile omits inherited requirements and permits empty runtime intersection",
  async () => {
    const result = await runWorkflow({
      realSecretSpec: realSecretSpec ?? "",
      spec: standardSpec
        .profile(
          "release",
          {
            FORGE_ENVIRONMENT: {
              description: "Standalone target",
              default: "production",
            },
            LOCAL_ONLY: { description: "Standalone value", required: true },
          },
          false,
        )
        .build(),
      env: {
        SECRETSPEC_PROVIDER: "dotenv:values.env",
        SECRETSPEC_PROFILE: "release",
      },
      dotenv: "LOCAL_ONLY=synthetic-standalone\n",
    });
    expect({ exitCode: result.exitCode, stderr: result.stderr }).toEqual({
      exitCode: 0,
      stderr: "",
    });
    expect(result.interactions.filter(({ tool }) => tool === "forge")).toEqual(
      [],
    );
  },
);

test.skipIf(!realSecretSpec)(
  "native absent optional overrides stale ambient values without narrowing the full profile",
  async () => {
    const result = await runWorkflow({
      realSecretSpec: realSecretSpec ?? "",
      env: {
        SECRETSPEC_PROVIDER: "dotenv:values.env",
        SECRETSPEC_SCOPE: "unknown-ambient-scope",
        OPTIONAL: "synthetic-stale-optional",
      },
      dotenv:
        "SHARED=synthetic-native-shared\nLOCAL_ONLY=synthetic-native-local\n",
    });
    expect({ exitCode: result.exitCode, stderr: result.stderr }).toEqual({
      exitCode: 0,
      stderr: "",
    });
    const forge = result.interactions.filter(({ tool }) => tool === "forge");
    expect(forge).toHaveLength(1);
    expect(forge.map(({ values }) => values)).toEqual([
      {
        FORGE_ENVIRONMENT: "staging",
        SHARED: "synthetic-native-shared",
        LOCAL_ONLY: "synthetic-native-local",
      },
    ]);
    expect(result.stdout + result.stderr).not.toContain("synthetic-stale");
  },
);

test.skipIf(!realSecretSpec).each([
  {
    name: "local empty",
    local: "",
    runtime: "synthetic-runtime",
  },
  { name: "string zero", local: "false", runtime: "0" },
  { name: "string false", local: "0", runtime: "false" },
])(
  "native dotenv values: $name preserves strings",
  async ({ local, runtime }) => {
    const result = await runWorkflow({
      realSecretSpec: realSecretSpec ?? "",
      env: { SECRETSPEC_PROVIDER: "dotenv:values.env" },
      dotenv: `SHARED=${runtime}\nLOCAL_ONLY=${local}\n`,
    });
    expect(result.exitCode).toBe(0);
    const forge = result.interactions.filter(({ tool }) => tool === "forge");
    expect(forge.map(({ args }) => args)).toEqual([
      [
        "variables",
        "set",
        "--encrypt",
        "--environment",
        "staging",
        "SHARED",
        runtime,
      ],
    ]);
    expect(forge.map(({ values }) => values)).toEqual([
      { FORGE_ENVIRONMENT: "staging", SHARED: runtime, LOCAL_ONLY: local },
    ]);
  },
);

test.skipIf(!realSecretSpec).each([
  {
    name: "empty extends",
    spec: standardSpec.extending([]).build(),
    succeeds: true,
  },
  {
    name: "omitted runtime",
    spec: standardSpec.dropScope("runtime").build(),
    succeeds: true,
  },
  {
    name: "numeric default",
    spec: standardSpec.modify("FORGE_ENVIRONMENT", { default: 0 }).build(),
    succeeds: false,
  },
  {
    name: "boolean default",
    spec: standardSpec.modify("FORGE_ENVIRONMENT", { default: false }).build(),
    succeeds: false,
  },
  {
    name: "invalid native type",
    spec: standardSpec.modify("OPTIONAL", { type: "number" }).build(),
    succeeds: false,
  },
  {
    name: "empty profile",
    spec: '[project]\nname = "synthetic"\nrevision = "1.0"\n[profiles.default]\n',
    succeeds: false,
  },
  {
    name: "empty optional profile",
    spec: '[project]\nname = "synthetic"\nrevision = "1.0"\n[profiles.default]\nOPTIONAL = { description = "Optional", required = false }\n',
    succeeds: true,
  },
])(
  "native configuration: $name is validated, uploading only declared runtime values",
  async ({ name, spec, succeeds }) => {
    const result = await runWorkflow({
      realSecretSpec: realSecretSpec ?? "",
      spec,
      env: { SECRETSPEC_PROVIDER: "dotenv:values.env" },
      dotenv:
        "SHARED=synthetic-native-shared\nLOCAL_ONLY=synthetic-native-local\n",
    });
    expect({
      exitCode: result.exitCode === 0,
      stderr: succeeds ? result.stderr : "",
    }).toEqual({ exitCode: succeeds, stderr: "" });
    const forge = result.interactions.filter(({ tool }) => tool === "forge");
    expect(forge).toHaveLength(name === "empty extends" ? 1 : 0);
  },
);

test.skipIf(!realSecretSpec).each([
  {
    name: "manifest requirement",
    spec: standardSpec.addScope("manifest", ["LOCAL_ONLY"]).build(),
    provider: "dotenv:values.env",
    dotenv: "SHARED=synthetic-native-shared\n",
  },
  {
    name: "missing local provider file",
    spec: deploymentSpec,
    provider: "dotenv:missing.env",
    dotenv: "",
  },
  {
    name: "unknown active profile",
    spec: deploymentSpec,
    provider: "dotenv:values.env",
    dotenv: "",
    profile: "unknown-profile",
  },
])(
  "native resolution failure: $name prevents every Forge command",
  async ({ spec, provider, dotenv, profile }) => {
    const result = await runWorkflow({
      realSecretSpec: realSecretSpec ?? "",
      spec,
      env: {
        SECRETSPEC_PROVIDER: provider,
        SECRETSPEC_SCOPE: "runtime",
        ...(profile ? { SECRETSPEC_PROFILE: profile } : {}),
      },
      dotenv,
      manifest: "environment:\n  variables: [LOCAL_ONLY]\n",
      args: ["-e", "production"],
    });
    expect(result.exitCode).not.toBe(0);
    expect(result.interactions.filter(({ tool }) => tool === "forge")).toEqual(
      [],
    );
    expect(result.stderr).toContain("SecretSpec");
    expect(result.stderr).toContain("target production");
    expect(result.stdout + result.stderr).not.toContain("synthetic-native");
  },
);
