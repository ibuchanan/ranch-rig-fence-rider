/**
 * What SecretSpec answers, defined once for both fake tools: the in-process
 * fake (fake-io.ts) and the spawned one (fake-tool.ts) call the same functions,
 * and the standard profile's data lives here. The native contract test holds
 * these answers against what real SecretSpec prints for the same profile.
 *
 * The spawned fake loads this file as a standalone Bun script, so it imports
 * nothing from `src/`.
 */
import { sharedValue } from "./guarantees.ts";
import { type Control, SpecBuilder } from "./spec.ts";

type Controls = Record<string, Control>;

/** The values the standard spec resolves to, defaults included. */
export const standardValues = {
  FORGE_ENVIRONMENT: "staging",
  SHARED: sharedValue,
  LOCAL_ONLY: "synthetic local-only",
};

/** `secretspec schema`: the JSON Schema of a profile. */
export function schemaFor(controls: Controls) {
  const sorted = Object.entries(controls).sort(([a], [b]) =>
    a.localeCompare(b),
  );
  return {
    $schema: "http://json-schema.org/draft-06/schema#",
    type: "object",
    additionalProperties: false,
    title: "SecretSpec",
    properties: Object.fromEntries(
      sorted.map(([name, control]) => [
        name,
        {
          type: control.required === false ? ["string", "null"] : "string",
          ...(control.description === undefined
            ? {}
            : { description: control.description }),
        },
      ]),
    ),
    required: sorted
      .filter(([, control]) => control.required !== false)
      .map(([name]) => name),
  };
}

export const standardSchema = schemaFor(SpecBuilder.standard().controls());

/** What a fake is told to answer; both fakes take the same data. */
export type Answers = {
  schema?: unknown;
  values?: unknown;
  /** Text to print instead of the schema or the exported values. */
  schemaOutput?: string | undefined;
  exportOutput?: string | undefined;
};

/** A helper call that SecretSpec would fail: the status and what it prints on stderr. */
export class AnswerFailure extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

type Spec = {
  profiles?: { default?: Controls };
  scopes?: Record<string, { secrets: string[] }>;
};

const objectOrEmpty = (value: unknown) =>
  typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : {};

/**
 * `secretspec check --json --scope <scope>`: the scope's members that the
 * schema declares, each reported as SecretSpec does. A value equal to the
 * declared default is reported as the default, since the exported values
 * carry defaults without saying where they came from.
 *
 * `provider` and `source_provider` name where values were read, which a fake
 * has no way to know; they carry a placeholder.
 */
function scopeReport(specText: string, args: string[], answers: Answers) {
  const spec = Bun.TOML.parse(specText) as Spec;
  const controls = spec.profiles?.default ?? {};
  const scopes = spec.scopes ?? {};
  const scope = args[args.indexOf("--scope") + 1];
  const entry = scope === undefined ? undefined : scopes[scope];
  if (scope === undefined || !entry)
    throw new AnswerFailure(
      1,
      `Invalid scope: '${scope}' is not defined in secretspec.toml. Available scopes: ${Object.keys(scopes).sort().join(", ")}`,
    );
  const declared = Object.keys(
    objectOrEmpty(objectOrEmpty(answers.schema)["properties"]),
  );
  const values = objectOrEmpty(answers.values);
  return {
    schema_version: 1,
    provider: "fake",
    profile: "default",
    scope,
    secrets: entry.secrets
      .filter((name) => declared.includes(name))
      .map((name) => {
        const control = controls[name] ?? {};
        const hasValue = Object.hasOwn(values, name);
        const fromDefault = hasValue && values[name] === control.default;
        const required =
          control.required !== false && control.default === undefined;
        return {
          name,
          status: hasValue
            ? "resolved"
            : required
              ? "missing_required"
              : "missing_optional",
          required,
          ...(hasValue && !fromDefault ? { source_provider: "fake" } : {}),
          default_applied: fromDefault,
          generated: false,
          as_path: false,
        };
      }),
  };
}

/**
 * The output of a SecretSpec helper call, or an AnswerFailure. `readSpec` is
 * called only when the answer needs the spec file.
 */
export function secretspecAnswer(
  args: string[],
  answers: Answers,
  readSpec: () => string,
) {
  if (args[0] === "schema")
    return answers.schemaOutput ?? JSON.stringify(answers.schema);
  if (args[0] === "check")
    return JSON.stringify(scopeReport(readSpec(), args, answers));
  return answers.exportOutput ?? JSON.stringify(answers.values);
}
