import { expect, test } from "bun:test";
import {
  deploymentSchema,
  deploymentSpec,
  deploymentValues,
  type ToolCall,
} from "../support/fixtures.ts";
import { runInProcess } from "../support/fake-io.ts";

const development = { ...deploymentValues, FORGE_ENVIRONMENT: "development" };
const forgeCalls = (interactions: ToolCall[]) =>
  interactions.filter(({ tool }) => tool === "forge");

test.each(["FORGE_ENVIRONMENT", "FORGE_SITE", "FORGE_PRODUCT"])(
  "tunnel refuses runtime selection of %s before printing anything",
  async (control) => {
    const result = await runInProcess({
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
      values: { ...development, [control]: "development" },
    });
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    expect(forgeCalls(result.interactions)).toEqual([]);
    expect(result.stderr).toContain("tunnel runtime selection validation");
  },
);

test("tunnel refuses reserved prefix declarations rather than losing local values or bypassing selection", async () => {
  const result = await runInProcess({
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
  expect(result.stdout).toBe("");
  expect(forgeCalls(result.interactions)).toEqual([]);
  expect(result.stderr).toContain("tunnel runtime selection validation");
  expect(result.stderr).not.toContain("synthetic collision");
});

test("the generator never prints a value", async () => {
  const result = await runInProcess({ command: "tunnel", values: development });
  expect(result.exitCode).toBe(0);
  expect(result.stdout).toStartWith("exec secretspec run --scope '' -- sh -c ");
  expect(result.stdout).toContain('export FORGE_USER_VAR_SHARED="$SHARED"');
  expect(result.stdout).not.toContain("FORGE_USER_VAR_LOCAL_ONLY");
  expect(result.stdout).toEndWith(`' sh tunnel "$@"\n`);
});

test.each([
  { args: ["-e", "--verbose"] },
  { args: ["-edevelopment", "--environment", "development"] },
])(
  "tunnel refuses invalid or duplicate targets %j before tools",
  async ({ args }) => {
    const result = await runInProcess({ command: "tunnel", args });
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.interactions).toEqual([]);
    expect(result.stderr).toContain("tunnel option validation");
  },
);
