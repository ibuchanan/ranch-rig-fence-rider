import { expect, test } from "bun:test";
import {
  deploymentSchema,
  standardSpec,
  deploymentValues,
  hostileValue,
  sharedValue,
} from "../support/fixtures.ts";
import { runInProcess } from "../support/fake-io.ts";

test.each([
  [["--non-interactive"]],
  [["--", "-x"]],
  [["-e", "production", "--verbose"]],
])("variables %j refuses Forge options before any tool call", async (args) => {
  const result = await runInProcess({ args });
  expect(result.exitCode).toBe(1);
  expect(result.interactions).toEqual([]);
  expect(result.stdout).toBe("");
  expect(result.stderr).toContain("environment option validation");
  expect(result.stderr).toContain("Forge options are not accepted");
  expect(result.stderr).toContain("fence-rider variables --help");
});

test.each(["secretspec", "forge"])(
  "missing %s stops before any helper interaction",
  async (missingTool) => {
    const result = await runInProcess({ missingTool });
    expect(result.exitCode).not.toBe(0);
    expect(result.interactions).toEqual([]);
    expect(result.stderr).toContain(missingTool);
    expect(result.stderr).toContain("PATH");
  },
);

test("variables resolves once and encrypts only runtime values for the configured target", async () => {
  const result = await runInProcess();
  expect(result.exitCode).toBe(0);
  expect(result.interactions.map(({ tool, args }) => [tool, ...args])).toEqual([
    ["secretspec", "schema"],
    ["secretspec", "export", "--scope", "", "--format", "json"],
    ["secretspec", "check", "--json", "--scope", "manifest"],
    ["secretspec", "check", "--json", "--scope", "runtime"],
    [
      "forge",
      "variables",
      "set",
      "--encrypt",
      "--environment",
      "staging",
      "SHARED",
      sharedValue,
    ],
  ]);
  expect(
    result.interactions
      .filter(({ tool }) => tool === "forge")
      .map(({ values }) => values),
  ).toEqual([deploymentValues]);
  expect(result.stdout + result.stderr).not.toContain("synthetic local-only");
});

test("a value with quotes, a newline and shell syntax is uploaded verbatim", async () => {
  const result = await runInProcess({
    values: { ...deploymentValues, SHARED: hostileValue },
  });
  expect(result.exitCode).toBe(0);
  const upload = result.interactions.find(({ tool }) => tool === "forge");
  expect(upload?.args.at(-1)).toBe(hostileValue);
});

test.each(["FORGE_ENVIRONMENT", "FORGE_SITE", "FORGE_PRODUCT"])(
  "%s cannot be selected for upload even with an explicit target",
  async (control) => {
    const result = await runInProcess({
      spec: (control === "FORGE_ENVIRONMENT"
        ? standardSpec
        : standardSpec.declare(control, { required: true })
      )
        .setMembers("runtime", ["SHARED", control])
        .build(),
      schema: {
        ...deploymentSchema,
        properties: {
          ...deploymentSchema.properties,
          [control]: { type: "string" },
        },
      },
      values: { ...deploymentValues, [control]: "staging" },
      args: ["-e", "production"],
    });
    expect(result.exitCode).not.toBe(0);
    expect(result.interactions.filter(({ tool }) => tool === "forge")).toEqual(
      [],
    );
    expect(result.stderr).toContain("runtime selection validation");
  },
);

test("variables emits safe stage progress without forwarding helper streams", async () => {
  const result = await runInProcess();
  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain(
    "Fence Rider: encrypted upload for SHARED (target staging).",
  );
  expect(result.stdout).toContain("Uploaded 1 runtime variable(s).");
  expect(result.stdout + result.stderr).not.toContain("synthetic helper noise");
});

test.each([
  {
    name: "omitted runtime scope",
    spec: standardSpec.dropScope("runtime").build(),
  },
  {
    name: "empty active-profile intersection",
    spec: standardSpec
      .setMembers("runtime", ["OTHER_PROFILE_VALUE"])
      .profile("other", {
        OTHER_PROFILE_VALUE: { description: "Not active" },
      })
      .build(),
  },
])("$name uploads nothing and deletes nothing", async ({ spec }) => {
  const result = await runInProcess({ spec });
  expect(result.exitCode).toBe(0);
  expect(result.interactions.filter(({ tool }) => tool === "forge")).toEqual(
    [],
  );
  expect(result.stdout).toContain("Uploaded 0 runtime variable(s).");
  expect(
    result.interactions
      .filter(({ tool }) => tool === "secretspec")
      .map(({ args }) => args[0]),
  ).toEqual(["schema", "export", "check", "check"]);
});

test("missing configured target falls back to development for uploads", async () => {
  const result = await runInProcess({
    values: { SHARED: sharedValue, LOCAL_ONLY: "synthetic local-only" },
    schema: { ...deploymentSchema, required: ["SHARED", "LOCAL_ONLY"] },
  });
  expect(result.exitCode).toBe(0);
  const forge = result.interactions.filter(({ tool }) => tool === "forge");
  expect(
    forge.map(({ args }) => args[args.indexOf("--environment") + 1]),
  ).toEqual(["development"]);
});

test("every runtime value is encrypted in declaration order", async () => {
  const result = await runInProcess({
    values: { ...deploymentValues, OPTIONAL: "second synthetic value" },
  });
  expect(result.exitCode).toBe(0);
  expect(
    result.interactions
      .filter(({ tool }) => tool === "forge")
      .map(({ args }) => args),
  ).toEqual([
    [
      "variables",
      "set",
      "--encrypt",
      "--environment",
      "staging",
      "SHARED",
      sharedValue,
    ],
    [
      "variables",
      "set",
      "--encrypt",
      "--environment",
      "staging",
      "OPTIONAL",
      "second synthetic value",
    ],
  ]);
});
