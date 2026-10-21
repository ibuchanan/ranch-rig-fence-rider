// fallow-ignore-file unused-class-member -- tests call these through the instances in fixtures.ts, which Fallow does not trace.
/** One SecretSpec declaration; key order is the order it is written in. */
export type Control = {
  description?: string;
  default?: string | number | boolean;
  required?: boolean;
  type?: string;
};

/** A change to a declaration: a key set to `undefined` is removed. */
type Change = { [Key in keyof Control]: Control[Key] | undefined };

type Profile = { inherit: boolean; controls: Map<string, Control> };

type State = {
  name: string;
  extendsNames: string[] | undefined;
  profiles: Map<string, Profile>;
  scopes: Map<string, string[]>;
};

const literal = (value: string | number | boolean) =>
  typeof value === "string" ? JSON.stringify(value) : String(value);

const declaration = (name: string, control: Control) =>
  `${name} = { ${Object.entries(control)
    .map(([key, value]) => `${key} = ${literal(value)}`)
    .join(", ")} }`;

const fail = (message: string): never => {
  throw new Error(`Test spec: ${message}`);
};

/**
 * Builds the text of a `secretspec.toml` for a test. Every change names what
 * it expects to find, so a variation that no longer applies to the standard
 * spec throws instead of silently leaving the text as it was.
 */
export class SpecBuilder {
  private constructor(private readonly state: State) {}

  /** A spec with a project name and an empty default profile. */
  static empty(name: string) {
    return new SpecBuilder({
      name,
      extendsNames: undefined,
      profiles: new Map([["default", { inherit: true, controls: new Map() }]]),
      scopes: new Map(),
    });
  }

  /** The spec most tests use: four default-profile values and a runtime scope. */
  static standard() {
    return SpecBuilder.empty("fence-rider-test")
      .declare("FORGE_ENVIRONMENT", {
        description: "Deployment target",
        default: "staging",
      })
      .declare("SHARED", {
        description: "Shared application value",
        required: true,
      })
      .declare("LOCAL_ONLY", {
        description: "Local application value",
        required: true,
      })
      .declare("OPTIONAL", {
        description: "Absent optional value",
        required: false,
      })
      .addScope("runtime", ["SHARED", "OPTIONAL"]);
  }

  private next(change: (state: State) => void) {
    const copy: State = {
      ...this.state,
      profiles: new Map(
        [...this.state.profiles].map(([name, profile]) => [
          name,
          { ...profile, controls: new Map(profile.controls) },
        ]),
      ),
      scopes: new Map(this.state.scopes),
    };
    change(copy);
    return new SpecBuilder(copy);
  }

  private profileNamed(state: State, profile: string) {
    return (
      state.profiles.get(profile) ?? fail(`profile "${profile}" is not defined`)
    );
  }

  /** Declare a value that the profile does not declare yet. */
  declare(name: string, control: Control, profile = "default") {
    return this.next((state) => {
      const { controls } = this.profileNamed(state, profile);
      if (controls.has(name))
        fail(`"${name}" is already declared in profile "${profile}"`);
      controls.set(name, control);
    });
  }

  /** Change a declaration the profile already has. */
  modify(name: string, change: Change, profile = "default") {
    return this.next((state) => {
      const { controls } = this.profileNamed(state, profile);
      const current =
        controls.get(name) ??
        fail(`"${name}" is not declared in profile "${profile}"`);
      const changed = Object.fromEntries(
        Object.entries({ ...current, ...change }).filter(
          ([, value]) => value !== undefined,
        ),
      );
      controls.set(name, changed);
    });
  }

  /** Add a profile; `inherit: false` makes it stand alone from the default one. */
  profile(name: string, controls: Record<string, Control>, inherit = true) {
    return this.next((state) => {
      if (state.profiles.has(name))
        fail(`profile "${name}" is already defined`);
      state.profiles.set(name, {
        inherit,
        controls: new Map(Object.entries(controls)),
      });
    });
  }

  /** Give the project an `extends` list. */
  extending(names: string[]) {
    return this.next((state) => {
      state.extendsNames = names;
    });
  }

  addScope(name: string, members: string[]) {
    return this.next((state) => {
      if (state.scopes.has(name)) fail(`scope "${name}" is already defined`);
      state.scopes.set(name, members);
    });
  }

  /** Replace the members of a scope that exists. */
  setMembers(name: string, members: string[]) {
    return this.next((state) => {
      if (!state.scopes.has(name)) fail(`scope "${name}" is not defined`);
      state.scopes.set(name, members);
    });
  }

  dropScope(name: string) {
    return this.next((state) => {
      if (!state.scopes.delete(name)) fail(`scope "${name}" is not defined`);
    });
  }

  /** The TOML text; fails if a scope lists a value that no profile declares. */
  build() {
    const declared = new Set(
      [...this.state.profiles.values()].flatMap(({ controls }) => [
        ...controls.keys(),
      ]),
    );
    for (const [scope, members] of this.state.scopes)
      for (const member of members)
        if (!declared.has(member))
          fail(`scope "${scope}" lists "${member}", which no profile declares`);
    const project = [
      `[project]\nname = ${literal(this.state.name)}\nrevision = "1.0"`,
      ...(this.state.extendsNames === undefined
        ? []
        : [`extends = ${JSON.stringify(this.state.extendsNames)}`]),
    ].join("\n");
    const profiles = [...this.state.profiles].map(([name, profile]) =>
      [
        ...(profile.inherit
          ? []
          : [`[profiles.${name}.defaults]\ninherit = false`]),
        `[profiles.${name}]`,
        ...[...profile.controls].map(([key, control]) =>
          declaration(key, control),
        ),
      ].join("\n"),
    );
    const scopes = [...this.state.scopes].map(
      ([name, members]) =>
        `[scopes.${name}]\nsecrets = [${members.map(literal).join(", ")}]`,
    );
    return `${[project, ...profiles, ...scopes].join("\n\n")}\n`;
  }
}
