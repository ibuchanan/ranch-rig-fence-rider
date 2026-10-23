import { expect, test } from "bun:test";
import {
  deploymentSchema,
  standardSpec,
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
      spec: (control === "FORGE_ENVIRONMENT"
        ? standardSpec
        : standardSpec.declare(control, { description: "Protected control" })
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
    spec: standardSpec
      .declare("FORGE_USER_VAR_LOCAL_ONLY", { description: "Collision" })
      .build(),
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

test.each([{ args: ["-e", "--verbose"] }])(
  "tunnel refuses invalid targets %j before tools",
  async ({ args }) => {
    const result = await runInProcess({ command: "tunnel", args });
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.interactions).toEqual([]);
    expect(result.stderr).toContain("Fence Rider:");
  },
);
