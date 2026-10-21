import { expect, test } from "bun:test";
import { SpecBuilder } from "../support/spec.ts";

const standard = SpecBuilder.standard();

test("the standard spec declares the shared values and a runtime scope", () => {
  expect(Bun.TOML.parse(standard.build())).toEqual({
    project: { name: "fence-rider-test", revision: "1.0" },
    profiles: {
      default: {
        FORGE_ENVIRONMENT: {
          description: "Deployment target",
          default: "staging",
        },
        SHARED: { description: "Shared application value", required: true },
        LOCAL_ONLY: { description: "Local application value", required: true },
        OPTIONAL: { description: "Absent optional value", required: false },
      },
    },
    scopes: { runtime: { secrets: ["SHARED", "OPTIONAL"] } },
  });
});

test("a variation changes a copy and leaves the standard spec alone", () => {
  const changed = standard.modify("OPTIONAL", { required: true }).build();
  expect(changed).toContain(
    'OPTIONAL = { description = "Absent optional value", required = true }',
  );
  expect(standard.build()).toContain("required = false");
});

test("modify drops a key set to undefined", () => {
  const spec = standard
    .modify("FORGE_ENVIRONMENT", { default: undefined, required: true })
    .build();
  expect(spec).toContain(
    'FORGE_ENVIRONMENT = { description = "Deployment target", required = true }',
  );
});

test("a profile can stand alone from the default one", () => {
  const parsed = Bun.TOML.parse(
    standard.profile("release", { A: { description: "A" } }, false).build(),
  ) as { profiles: Record<string, unknown> };
  expect(parsed.profiles["release"]).toEqual({
    A: { description: "A" },
    defaults: { inherit: false },
  });
});

test("extends is written into the project table", () => {
  expect(Bun.TOML.parse(standard.extending([]).build())).toMatchObject({
    project: { extends: [] },
  });
});

test.each([
  {
    name: "declaring a value twice",
    build: () => standard.declare("SHARED", {}),
    message: '"SHARED" is already declared in profile "default"',
  },
  {
    name: "declaring into an undefined profile",
    build: () => standard.declare("NEW", {}, "missing"),
    message: 'profile "missing" is not defined',
  },
  {
    name: "modifying an undeclared value",
    build: () => standard.modify("MISSING", { required: true }),
    message: '"MISSING" is not declared in profile "default"',
  },
  {
    name: "adding a profile twice",
    build: () => standard.profile("default", {}),
    message: 'profile "default" is already defined',
  },
  {
    name: "adding a scope twice",
    build: () => standard.addScope("runtime", []),
    message: 'scope "runtime" is already defined',
  },
  {
    name: "setting the members of an undefined scope",
    build: () => standard.setMembers("manifest", []),
    message: 'scope "manifest" is not defined',
  },
  {
    name: "dropping an undefined scope",
    build: () => standard.dropScope("manifest"),
    message: 'scope "manifest" is not defined',
  },
  {
    name: "a scope member that no profile declares",
    build: () =>
      standard.setMembers("runtime", ["SHARED", "UNDECLARED"]).build(),
    message: 'scope "runtime" lists "UNDECLARED", which no profile declares',
  },
])("$name fails with a message naming it", ({ build, message }) => {
  expect(build).toThrow(`Test spec: ${message}`);
});

test("a scope member declared only in another profile is accepted", () => {
  const spec = standard
    .setMembers("runtime", ["ELSEWHERE"])
    .profile("other", { ELSEWHERE: { description: "Elsewhere" } })
    .build();
  expect(Bun.TOML.parse(spec)).toMatchObject({
    scopes: { runtime: { secrets: ["ELSEWHERE"] } },
  });
});
