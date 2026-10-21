import { expect, test } from "bun:test";
import { useBuiltCli } from "./support/cli.ts";
import {
  deploymentSchema,
  deploymentSpec,
  installationSpec,
  realSecretSpec,
  runInstallation,
  runWorkflow,
} from "./support/fixtures.ts";

useBuiltCli();

test.skipIf(!realSecretSpec).each([
  {
    name: "canonical",
    declarations:
      'FORGE_ENVIRONMENT = { description = "Target", default = "development" }',
    args: [],
    pass: true,
    target: "development",
  },
  {
    name: "explicit override",
    declarations:
      'FORGE_ENVIRONMENT = { description = "Target", default = "staging" }',
    args: ["--environment=alice-dev"],
    pass: true,
    target: "alice-dev",
  },
  {
    name: "optional fallback",
    declarations:
      'FORGE_ENVIRONMENT = { description = "Target", required = false }',
    args: [],
    pass: true,
    target: "development",
  },
  {
    name: "required despite override",
    declarations:
      'FORGE_ENVIRONMENT = { description = "Target", required = true }',
    args: ["-edevelopment"],
    pass: false,
    target: "unused",
  },
])(
  "native configured tunnel controls-only profile: $name",
  async ({ declarations, args, pass, target }) => {
    const result = await runWorkflow({
      command: "tunnel",
      args,
      realSecretSpec: realSecretSpec ?? "",
      spec: `[project]\nname = "synthetic-tunnel-controls"\nrevision = "1.0"\n[profiles.default]\n${declarations}\nFORGE_SITE = { description = "Site", default = "synthetic.atlassian.net" }\nFORGE_PRODUCT = { description = "Product", default = "jira" }\n`,
      schema: {
        properties: {
          FORGE_ENVIRONMENT: {},
          FORGE_SITE: {},
          FORGE_PRODUCT: {},
        },
      },
      manifest: null,
      dotenv: "",
      env: {
        SECRETSPEC_PROVIDER: "dotenv:values.env",
        FORGE_ENVIRONMENT: "stale",
        FORGE_USER_VAR_UNDECLARED: "stale",
      },
    });
    expect(result.exitCode).toBe(pass ? 0 : 1);
    const forge = result.interactions.filter(({ tool }) => tool === "forge");
    expect(forge.map(({ args }) => args)).toEqual(
      pass ? [["tunnel", "--environment", target]] : [],
    );
    if (pass) expect(forge[0]?.runtime).toEqual({});
  },
);

test.skipIf(!realSecretSpec)(
  "native configured tunnel shares one inherited profile resolution with local manifest and runtime destinations",
  async () => {
    const spec = `${deploymentSpec.replace("[scopes.runtime]", '[profiles.localdev]\nFORGE_ENVIRONMENT = { description = "Target", default = "development" }\nLOCAL_ONLY = { description = "Local override", default = "synthetic-local-dev" }\n\n[scopes.runtime]')}\n[scopes.manifest]\nsecrets = ["SHARED"]\n`;
    const result = await runWorkflow({
      command: "tunnel",
      realSecretSpec: realSecretSpec ?? "",
      spec,
      files: { "selected.toml": spec },
      schema: deploymentSchema,
      manifest: "environment:\n  variables: [SHARED]\n",
      dotenv: "SHARED=synthetic-native-shared\nOPTIONAL=\n",
      env: {
        SECRETSPEC_FILE: "selected.toml",
        SECRETSPEC_PROFILE: "localdev",
        SECRETSPEC_PROVIDER: "dotenv:values.env",
        SECRETSPEC_SCOPE: "manifest",
        FORGE_USER_VAR_OPTIONAL: "stale",
        FORGE_USER_VAR_LOCAL_ONLY: "unauthorized",
      },
    });
    expect(result.exitCode).toBe(0);
    const forge = result.interactions.filter(({ tool }) => tool === "forge");
    expect(forge).toEqual([
      {
        tool: "forge",
        args: ["tunnel", "--environment", "development"],
        values: {
          FORGE_ENVIRONMENT: "development",
          SHARED: "synthetic-native-shared",
          LOCAL_ONLY: "synthetic-local-dev",
          OPTIONAL: "",
        },
        runtime: { SHARED: "synthetic-native-shared", OPTIONAL: "" },
      },
    ]);
    const native = result.interactions.filter(
      ({ tool }) => tool === "secretspec",
    );
    expect(native.map(({ args }) => args[0])).toEqual([
      "schema",
      "export",
      "check",
      "check",
    ]);
    for (const { args } of native) expect(args).not.toContain("--profile");
  },
);

test.skipIf(!realSecretSpec).each(["SHARED", "LOCAL_ONLY"])(
  "native configured tunnel blocks missing whole-profile %s despite explicit target",
  async (missing) => {
    const result = await runWorkflow({
      command: "tunnel",
      args: ["-edevelopment"],
      realSecretSpec: realSecretSpec ?? "",
      spec: deploymentSpec,
      schema: deploymentSchema,
      dotenv:
        missing === "SHARED"
          ? "LOCAL_ONLY=synthetic-local\n"
          : "SHARED=synthetic-shared\n",
      env: {
        SECRETSPEC_PROVIDER: "dotenv:values.env",
        SECRETSPEC_SCOPE: "runtime",
      },
    });
    expect(result.exitCode).toBe(1);
    expect(result.interactions.filter(({ tool }) => tool === "forge")).toEqual(
      [],
    );
  },
);

test.skipIf(!realSecretSpec)(
  "native configured tunnel omits absent optional runtime values and stale injection",
  async () => {
    const result = await runWorkflow({
      command: "tunnel",
      args: ["-edevelopment"],
      realSecretSpec: realSecretSpec ?? "",
      spec: deploymentSpec,
      schema: deploymentSchema,
      dotenv:
        "SHARED=synthetic-native-shared\nLOCAL_ONLY=synthetic-native-local\n",
      env: {
        SECRETSPEC_PROVIDER: "dotenv:values.env",
        OPTIONAL: "stale",
        FORGE_USER_VAR_OPTIONAL: "stale",
      },
    });
    expect(result.exitCode).toBe(0);
    expect(result.interactions.at(-1)?.values).toEqual({
      FORGE_ENVIRONMENT: "staging",
      SHARED: "synthetic-native-shared",
      LOCAL_ONLY: "synthetic-native-local",
    });
    expect(result.interactions.at(-1)?.runtime).toEqual({
      SHARED: "synthetic-native-shared",
    });
  },
);

test.skipIf(!realSecretSpec).each(
  [
    {
      name: "canonical",
      declarations: 'FORGE_ENVIRONMENT = { default = "staging" }',
      target: "staging",
      args: [],
      pass: true,
    },
    {
      name: "unresolved optional environment keeps the exported value",
      declarations: "FORGE_ENVIRONMENT = { required = false }",
      target: "stale",
      args: [],
      pass: true,
    },
    {
      name: "required environment",
      declarations: "FORGE_ENVIRONMENT = { required = true }",
      target: "unused",
      args: [],
      pass: false,
    },
  ].flatMap((scenario) =>
    (["install", "uninstall"] as const).map((command) => ({
      ...scenario,
      command,
    })),
  ),
)(
  "native configured $command controls-only profile: $name",
  async ({ command, declarations, target, args, pass }) => {
    const result = await runInstallation({
      command,
      realSecretSpec: realSecretSpec ?? "",
      spec: `[project]\nname = "synthetic-install"\nrevision = "1.0"\n[profiles.default]\n${declarations.replaceAll(" = {", ' = { description = "Synthetic control",')}\nFORGE_SITE = { description = "Installation site", default = "synthetic.atlassian.net" }\nFORGE_PRODUCT = { description = "Installation product", default = "jira" }\n`,
      schema: {
        properties: {
          FORGE_ENVIRONMENT: {},
          FORGE_SITE: {},
          FORGE_PRODUCT: {},
        },
      },
      env: {
        SECRETSPEC_PROVIDER: "dotenv:values.env",
        SECRETSPEC_PROFILE: "default",
        FORGE_ENVIRONMENT: "stale",
      },
      dotenv: "",
      args,
      manifest: null,
    });
    expect(result.exitCode).toBe(pass ? 0 : 1);
    expect(
      result.interactions
        .filter(({ tool }) => tool === "forge")
        .map(({ args }) => args),
    ).toEqual(
      pass
        ? [
            [
              command,
              "--environment",
              target,
              "--site",
              "synthetic.atlassian.net",
              "--product",
              "jira",
            ],
          ]
        : [],
    );
    if (pass)
      expect(
        result.interactions
          .filter(({ tool }) => tool === "secretspec")
          .map(({ args }) => args[0]),
      ).toEqual(["run"]);
  },
);

test.skipIf(!realSecretSpec).each(
  ["FORGE_SITE", "FORGE_PRODUCT", "SHARED", "LOCAL_ONLY"].flatMap((missing) =>
    (["install", "uninstall"] as const).map((command) => ({
      command,
      missing,
    })),
  ),
)(
  "native configured $command still requires $missing",
  async ({ command, missing }) => {
    const spec = installationSpec
      .replace('default = "synthetic.atlassian.net"', "required = true")
      .replace('default = "jira"', "required = true");
    const values = {
      FORGE_SITE: "synthetic.atlassian.net",
      FORGE_PRODUCT: "jira",
      SHARED: "synthetic-native-shared",
      LOCAL_ONLY: "synthetic-native-local",
    };
    const result = await runInstallation({
      command,
      realSecretSpec: realSecretSpec ?? "",
      spec,
      env: {
        SECRETSPEC_PROVIDER: "dotenv:values.env",
        SECRETSPEC_SCOPE: "runtime",
      },
      dotenv: Object.entries(values)
        .filter(([name]) => name !== missing)
        .map(([name, value]) => `${name}=${value}\n`)
        .join(""),
    });
    expect(result.exitCode).toBe(1);
    expect(result.interactions.filter(({ tool }) => tool === "forge")).toEqual(
      [],
    );
    expect(result.stderr).toContain(missing);
    expect(result.stderr).toContain(
      `${command === "install" ? "installation" : "uninstallation"} failed`,
    );
  },
);
