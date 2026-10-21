import { expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { CommandFailure } from "../../../src/process";
import { useBuiltCli } from "../../support/cli.ts";
import { answer } from "../../support/fake-io.ts";
import {
  deploymentEnv,
  deploymentValues,
  prepareProject,
  realSecretSpec,
  standardSpec,
} from "../../support/fixtures.ts";

useBuiltCli();

/**
 * The fakes answer for the standard profile from one shared module. These
 * tests hold those answers against what real SecretSpec prints for the same
 * profile, so a change in SecretSpec, or drift between the fakes, fails here.
 */

// A scope over every declaration, so the report shows a provided value, an
// applied default and an absent optional.
const spec = standardSpec
  .addScope("everything", [
    "FORGE_ENVIRONMENT",
    "SHARED",
    "LOCAL_ONLY",
    "OPTIONAL",
  ])
  .build();

// Where a value was read is the one thing a fake cannot know.
const placeholder = (key: string, value: unknown) =>
  key === "provider" || key === "source_provider" ? "<provider>" : value;
// Real SecretSpec lists a scope's members by name; the fakes keep the order the
// spec declares them in, which the unit tests of upload order rely on.
const byName = (key: string, value: unknown) =>
  key === "secrets" && Array.isArray(value)
    ? [...value].sort((a, b) => a.name.localeCompare(b.name))
    : value;
const normalized = (text: string) =>
  JSON.parse(text, (key, value) => byName(key, placeholder(key, value)));

type Answer = { status: number; stdout: string; stderr: string };

async function runReal(project: string, args: string[]): Promise<Answer> {
  const dotenv = Object.entries(deploymentValues)
    .filter(([name]) => name !== "FORGE_ENVIRONMENT")
    .map(([name, value]) => `${name}=${value}`)
    .join("\n");
  writeFileSync(join(project, "values.env"), `${dotenv}\n`);
  const child = Bun.spawn([realSecretSpec ?? "", ...args], {
    cwd: project,
    env: {
      ...deploymentEnv(project, {}),
      SECRETSPEC_PROVIDER: "dotenv:values.env",
    },
    stdout: "pipe",
    stderr: "pipe",
  });
  const [status, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  return { status, stdout, stderr };
}

async function runSpawnedFake(project: string, args: string[]) {
  const child = Bun.spawn([join(project, "bin", "secretspec"), ...args], {
    cwd: project,
    env: deploymentEnv(project, {}),
    stdout: "pipe",
    stderr: "pipe",
  });
  const [status, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  return { status, stdout, stderr };
}

function runInProcessFake(args: string[]): Answer {
  try {
    return {
      status: 0,
      stdout: answer({ spec }, "secretspec", args),
      stderr: "",
    };
  } catch (error) {
    if (!(error instanceof CommandFailure)) throw error;
    return { status: error.exitCode, stdout: "", stderr: error.diagnostic };
  }
}

const calls = [
  { name: "schema", args: ["schema"] },
  { name: "export", args: ["export", "--scope", "", "--format", "json"] },
  {
    name: "scope report",
    args: ["check", "--json", "--scope", "everything"],
  },
];

test.skipIf(!realSecretSpec).each(calls)(
  "native fakes answer secretspec $name as real SecretSpec does",
  async ({ args }) => {
    const project = prepareProject({ spec });
    const real = await runReal(project, args);
    expect(real.status).toBe(0);
    const spawned = await runSpawnedFake(project, args);
    expect(spawned.status).toBe(0);
    expect(normalized(spawned.stdout)).toEqual(normalized(real.stdout));
    expect(normalized(runInProcessFake(args).stdout)).toEqual(
      normalized(real.stdout),
    );
  },
);

test.skipIf(!realSecretSpec)(
  "native fakes refuse an undeclared scope as real SecretSpec does",
  async () => {
    const args = ["check", "--json", "--scope", "nowhere"];
    const project = prepareProject({ spec });
    const real = await runReal(project, args);
    // The real message wraps across lines; the fakes also print unrelated noise.
    const collapse = (text: string) => text.replace(/\s+/g, " ");
    const message = (fake: Answer) =>
      fake.stderr.split("\n").find((line) => line.startsWith("Invalid scope"));
    for (const fake of [
      await runSpawnedFake(project, args),
      runInProcessFake(args),
    ]) {
      expect(fake.status).toBe(real.status);
      expect(message(fake)).toBeDefined();
      expect(collapse(real.stderr)).toContain(collapse(message(fake) ?? ""));
    }
  },
);
