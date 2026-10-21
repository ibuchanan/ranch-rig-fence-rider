import { basename } from "node:path";
import { describe, expect, test } from "bun:test";
import { main } from "../../src/cli";
import type { Io } from "../../src/io";
import { CommandFailure } from "../../src/process";
import { recordingIo } from "../support/main.ts";

type Tools = Record<string, string | null>;

type Project = {
  /** Printed by a fake `secretspec check --json --scope manifest`; "fail" exits 1 for an unrelated error, "undefined" as for a scope no file defines. */
  report?: string[] | "fail" | "undefined";
  /** Same, for `--scope runtime`; defaults to a scope no file defines. */
  runtime?: string[] | "undefined";
  /** Printed by a fake `secretspec schema`; defaults to one valid string declaration. */
  schema?: object | "fail";
  /** The exported environment; defaults to empty. */
  env?: Record<string, string>;
  /** The manifest.yml in the project, when it has one. */
  manifest?: string;
};

/** Run `doctor` in-process against fake tools whose `--version` prints the given text (null: tool absent). */
async function runDoctor(
  tools: Tools,
  args: string[] = [],
  toml?: string,
  project: Project = {},
) {
  const recorded = recordingIo();
  const io: Io = {
    ...recorded.io,
    env: project.env ?? {},
    which: (tool) => (tools[tool] ? `/fake/bin/${tool}` : null),
    readFile: async (path) => {
      if (path.endsWith("secretspec.toml") && toml !== undefined) return toml;
      if (path.endsWith("manifest.yml") && project.manifest !== undefined)
        return project.manifest;
      throw new Error(`ENOENT: no such file or directory, open '${path}'`);
    },
    capture: async (path, callArgs) => {
      if (callArgs[0] === "schema") {
        if (project.schema === "fail")
          throw new CommandFailure("exit status 1", 1, "Invalid schema");
        return JSON.stringify(
          project.schema ?? {
            type: "object",
            properties: { A: { type: "string" } },
          },
        );
      }
      if (callArgs[0] === "check") {
        const scope = callArgs.at(-1);
        const report =
          (scope === "runtime" ? project.runtime : project.report) ??
          "undefined";
        if (report === "fail")
          throw new CommandFailure("exit status 1", 1, "Invalid scope");
        if (report === "undefined")
          throw new CommandFailure(
            "exit status 1",
            1,
            `Scope '${scope}' is not defined in secretspec.toml`,
          );
        return JSON.stringify({
          schema_version: 1,
          scope,
          secrets: report.map((name) => ({ name, status: "resolved" })),
        });
      }
      return `${tools[basename(path)]}\n`;
    },
  };
  const exitCode = await main(["doctor", ...args], io);
  return { exitCode, stdout: recorded.stdout(), stderr: recorded.stderr() };
}

test("doctor passes when both tools are within the tested range", async () => {
  const result = await runDoctor({
    secretspec: "secretspec 0.21.1",
    forge: "14.2.0",
  });
  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain("SecretSpec: 0.21.1 ok");
  expect(result.stdout).toContain("Forge CLI: 14.2.0 ok");
  expect(result.stdout).toContain("supported from 0.17.0, tested through");
});

test("doctor warns about newer versions without failing", async () => {
  const result = await runDoctor({
    secretspec: "secretspec 99.0.0",
    forge: "99.1",
  });
  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain("SecretSpec: 99.0.0 untested");
  expect(result.stdout).toContain("Forge CLI: 99.1 untested");
});

test("doctor fails for a version older than supported", async () => {
  const result = await runDoctor({
    secretspec: "secretspec 0.16.9",
    forge: "14.2.0",
  });
  expect(result.exitCode).toBe(1);
  expect(result.stdout).toContain("SecretSpec: 0.16.9 unsupported");
  expect(result.stdout).toContain("Forge CLI: 14.2.0 ok");
});

test("doctor fails for a missing tool and still reports the other", async () => {
  const result = await runDoctor({ secretspec: null, forge: "14.2.0" });
  expect(result.exitCode).toBe(1);
  expect(result.stdout).toContain("SecretSpec: not found on PATH");
  expect(result.stdout).toContain("Forge CLI: 14.2.0 ok");
});

test("doctor fails when a version cannot be read", async () => {
  const result = await runDoctor({
    secretspec: "secretspec dev build",
    forge: "14.2.0",
  });
  expect(result.exitCode).toBe(1);
  expect(result.stdout).toContain("SecretSpec: no version found unreadable");
});

test("doctor accepts no arguments", async () => {
  const result = await runDoctor({}, ["--verbose"]);
  expect(result.exitCode).toBe(1);
  expect(result.stderr).toContain("Unknown command or unsupported arguments");
});

const spec = (scopes: string) =>
  `[project]\nname = "x"\nrevision = "1.0"\n[profiles.default]\nA = { description = "a" }\n${scopes}`;
const ok = { secretspec: "secretspec 0.21.1", forge: "14.2.0" };

test("doctor skips the scope check without a SecretSpec file", async () => {
  const result = await runDoctor(ok);
  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain("scope check skipped");
});

test("doctor accepts the recognized scopes", async () => {
  const result = await runDoctor(
    ok,
    [],
    spec(
      '[scopes.manifest]\nsecrets = ["A"]\n[scopes.runtime]\nsecrets = ["A"]\n',
    ),
    { report: ["A"], manifest: "environment:\n  variables: [A]\n" },
  );
  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain("scopes ok");
});

test("doctor warns about a scope Fence Rider never reads without failing", async () => {
  const result = await runDoctor(
    ok,
    [],
    spec('[scopes.runtim]\nsecrets = ["A"]\n'),
  );
  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain(
    'scope "runtim" is not read by Fence Rider (recognized: manifest, runtime)',
  );
});

test("doctor warns and skips the scope check when the file cannot be parsed", async () => {
  const result = await runDoctor(ok, [], "not valid TOML = [");
  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain("missing or unparsable; scope check skipped");
});

const manifestSpec = spec('[scopes.manifest]\nsecrets = ["A", "B"]\n');

test("doctor skips the manifest check when no file defines a manifest scope", async () => {
  const result = await runDoctor(ok, [], spec(""), { report: "undefined" });
  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain("Manifest: no manifest scope; check skipped");
});

test("doctor skips the manifest check when SecretSpec defines no manifest scope and the file is missing", async () => {
  const result = await runDoctor(ok, [], undefined, { report: "undefined" });
  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain("Manifest: no manifest scope; check skipped");
});

test("doctor checks a manifest scope that only SecretSpec sees, as when inherited", async () => {
  const result = await runDoctor(ok, [], spec(""), {
    report: ["A", "B"],
    manifest: "environment:\n  variables: [A]\n",
  });
  expect(result.exitCode).toBe(1);
  expect(result.stdout).toContain(
    "Manifest: manifest declaration for B failed",
  );
});

test("doctor still checks the manifest scope when the file is unparsable or missing", async () => {
  const project = {
    report: ["A", "B"],
    manifest: "environment:\n  variables: [A]\n",
  };
  for (const toml of ["not valid TOML = [", undefined]) {
    const result = await runDoctor(ok, [], toml, project);
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain(
      "Manifest: manifest declaration for B failed",
    );
    expect(result.stdout).toContain("scope check skipped");
  }
});

test("doctor passes when every manifest scope member is declared in manifest.yml", async () => {
  const result = await runDoctor(ok, [], manifestSpec, {
    report: ["A", "B"],
    manifest:
      "environment:\n  variables:\n    - A\n    - key: B\n      default: x\n",
  });
  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain(
    "Manifest: manifest scope members are declared in manifest.yml",
  );
});

test("doctor fails and names the manifest member that is not declared", async () => {
  const result = await runDoctor(ok, [], manifestSpec, {
    report: ["A", "B"],
    manifest: "environment:\n  variables: [A]\n",
  });
  expect(result.exitCode).toBe(1);
  expect(result.stdout).toContain(
    "Manifest: manifest declaration for B failed",
  );
});

test("doctor fails when manifest scope members exist but manifest.yml is missing", async () => {
  const result = await runDoctor(ok, [], manifestSpec, { report: ["A"] });
  expect(result.exitCode).toBe(1);
  expect(result.stdout).toContain("Manifest: manifest validation failed");
});

test("doctor needs no manifest.yml when the manifest scope has no members", async () => {
  const result = await runDoctor(ok, [], manifestSpec, { report: [] });
  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain("Manifest: no manifest scope; check skipped");
});

test("doctor fails privately when the scope check itself fails", async () => {
  const result = await runDoctor(ok, [], manifestSpec, { report: "fail" });
  expect(result.exitCode).toBe(1);
  expect(result.stdout).toContain(
    "Manifest: SecretSpec manifest scope membership failed",
  );
  expect(result.stdout + result.stderr).not.toContain("Invalid scope");
});

test("doctor skips the manifest check when secretspec is missing", async () => {
  const result = await runDoctor(
    { secretspec: null, forge: "14.2.0" },
    [],
    manifestSpec,
    { manifest: "environment:\n  variables: [A]\n" },
  );
  expect(result.exitCode).toBe(1);
  expect(result.stdout).toContain("SecretSpec: not found on PATH");
  expect(result.stdout).toContain("Manifest: no manifest scope; check skipped");
});

test("doctor reports the runtime member count without a value", async () => {
  const result = await runDoctor(ok, [], undefined, {
    runtime: ["A", "B"],
  });
  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain(
    "Runtime: 2 members would be uploaded by variables",
  );
});

test("doctor warns, without failing, when the runtime scope has no members", async () => {
  for (const runtime of ["undefined", [] as string[]] as const) {
    const result = await runDoctor(ok, [], undefined, { runtime });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain(
      "Runtime: scope is undefined or has no members; variables would upload nothing",
    );
  }
});

test("doctor fails and names a local control in the runtime scope", async () => {
  const result = await runDoctor(ok, [], undefined, {
    runtime: ["A", "FORGE_SITE"],
  });
  expect(result.exitCode).toBe(1);
  expect(result.stdout).toContain(
    "Runtime: FORGE_SITE is a local control; variables refuses to upload it",
  );
});

const schemaOf = (properties: object) => ({ type: "object", properties });

test("doctor reports a valid schema as ok", async () => {
  const result = await runDoctor(ok, [], undefined, {
    schema: schemaOf({
      A: { type: "string" },
      B_1: { type: ["string", "null"] },
    }),
  });
  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain("Schema: 2 declarations ok");
});

test.each(["A-B", "1A", "A B"])(
  "doctor fails a schema with the bad name %s",
  async (name) => {
    const result = await runDoctor(ok, [], undefined, {
      schema: schemaOf({ [name]: { type: "string" } }),
    });
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain("Schema: SecretSpec schema failed");
  },
);

test.each([{ type: "number" }, { type: ["string", "number"] }, {}])(
  "doctor fails a schema declaring %p",
  async (declaration) => {
    const result = await runDoctor(ok, [], undefined, {
      schema: schemaOf({ A: declaration }),
    });
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain("Schema: SecretSpec schema failed");
  },
);

test("doctor reports a SecretSpec failure reading the schema without its stderr", async () => {
  const result = await runDoctor(ok, [], undefined, { schema: "fail" });
  expect(result.exitCode).toBe(1);
  expect(result.stdout).toContain("Schema: SecretSpec schema failed");
  expect(result.stdout + result.stderr).not.toContain("Invalid schema");
});

describe("ambient shadowing", () => {
  const secret = "s3cr3t-value";

  test("doctor reports a clean environment", async () => {
    const result = await runDoctor(ok);
    expect(result.stdout).toContain("Environment: no ambient shadowing");
  });

  test("doctor warns about an exported declared key or local control, by name", async () => {
    const result = await runDoctor(ok, [], undefined, {
      env: { A: secret, FORGE_SITE: secret, UNRELATED: secret },
    });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Environment: A is exported");
    expect(result.stdout).toContain("Environment: FORGE_SITE is exported");
    expect(result.stdout).not.toContain("UNRELATED");
    expect(result.stdout).not.toContain(secret);
    expect(result.stderr).not.toContain(secret);
  });

  test("doctor warns only about FORGE_USER_VAR_ names tunnel cannot clear", async () => {
    const result = await runDoctor(ok, [], undefined, {
      env: { "FORGE_USER_VAR_A-B": secret, FORGE_USER_VAR_OK: secret },
    });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain(
      "Environment: FORGE_USER_VAR_A-B is exported",
    );
    expect(result.stdout).not.toContain("FORGE_USER_VAR_OK");
    expect(result.stdout).not.toContain(secret);
  });
});
