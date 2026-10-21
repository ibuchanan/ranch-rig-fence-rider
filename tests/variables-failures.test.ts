import { expect, test } from "bun:test";
import { useBuiltCli } from "./support/cli.ts";
import { deploymentValues, runWorkflow } from "./support/fixtures.ts";

useBuiltCli();

test("resolution and upload failures never report success or leak helper output", async () => {
  for (const failStage of ["schema", "export", "variables"]) {
    const result = await runWorkflow({ failStage });
    expect(result.exitCode).not.toBe(0);
    expect(result.stdout).not.toContain("Uploaded");
    expect(result.stderr).not.toContain("synthetic helper noise");
    expect(result.stderr).toContain(
      failStage === "schema"
        ? "SecretSpec schema"
        : failStage === "export"
          ? "SecretSpec resolution"
          : "staging",
    );
  }
});

test.each(["secretspec", "forge"])(
  "unlaunchable %s executable reports safe actionable context",
  async (launchTool) => {
    const result = await runWorkflow({
      launchTool,
      args: ["-e", "production"],
    });
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain("unable to launch");
    expect(result.stderr).toContain("executable");
    expect(result.stderr).toContain("target production");
    expect(result.interactions.some(({ tool }) => tool === launchTool)).toBe(
      false,
    );
    expect(result.stdout).not.toContain("Uploaded");
  },
);

test.each(["schema", "export", "variables"])(
  "child signal termination during %s cannot become success",
  async (failStage) => {
    const result = await runWorkflow({
      failStage,
      failureMode: "signal",
      args: ["-e", "production"],
    });
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain("terminated by SIGTERM");
    expect(result.stderr).toContain("target production");
    expect(result.interactions.at(-1)?.args[0]).toBe(failStage);
    expect(result.stdout).not.toContain("Uploaded");
  },
);

test.each(["schema", "export", "variables"])(
  "helper exception during %s never leaks stdout stderr or error details",
  async (failStage) => {
    const result = await runWorkflow({
      failStage,
      failureMode: "throw",
      args: ["-e", "production"],
    });
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain("target production");
    expect(result.interactions.at(-1)?.args[0]).toBe(failStage);
    expect(result.stdout + result.stderr).not.toContain(
      "synthetic error details",
    );
    expect(result.stdout + result.stderr).not.toContain(
      "synthetic helper noise",
    );
  },
);

test.each([2, 23, 127, 255])(
  "a failed upload with exit status %i is reported as exit 1 without raw helper output",
  async (exitCode) => {
    const result = await runWorkflow({ failStage: "variables", exitCode });
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain(`exit status ${exitCode}`);
    expect(result.stderr).toContain(
      "encrypted upload for SHARED (target staging)",
    );
    expect(result.stderr).toContain(
      "Remote variables may already have changed",
    );
  },
);

test.each(["SHARED", "OPTIONAL"])(
  "failed upload for %s stops later writes and reports possible partial state",
  async (failKey) => {
    const result = await runWorkflow({
      values: { ...deploymentValues, OPTIONAL: "second synthetic value" },
      failStage: "variables",
      failKey,
    });
    expect(result.exitCode).not.toBe(0);
    expect(
      result.interactions
        .filter(({ tool }) => tool === "forge")
        .map(({ args }) => args[5]),
    ).toEqual(failKey === "SHARED" ? ["SHARED"] : ["SHARED", "OPTIONAL"]);
    expect(result.stderr).toContain(`encrypted upload for ${failKey}`);
    expect(result.stderr).toContain("target staging");
    expect(result.stderr).toContain(
      "Remote variables may already have changed",
    );
    expect(result.stdout).not.toContain("Uploaded");
  },
);
