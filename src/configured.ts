import type { Io } from "./io";
import { CommandFailure } from "./process";
import {
  declaredNames,
  manifestKeys,
  parseMembers,
  parseResolved,
  parseUnresolved,
} from "./resolution";
import type { Workflow } from "./workflow";

/**
 * Names declared in manifest.yml, read from the working directory (the Forge
 * app root), which need not be the directory holding the SecretSpec file.
 */
async function parseManifestKeys(io: Io) {
  return manifestKeys(Bun.YAML.parse(await io.readFile("manifest.yml")));
}

/** SecretSpec reports a scope the file does not define only as this error text. */
const undefinedScope = /is not defined in secretspec\.toml/;

/**
 * Names in one SecretSpec scope, asked of SecretSpec so inheritance and scope
 * rules stay its own. A scope the file does not define has no members.
 */
export async function scopeMembers(
  tool: string,
  scope: string,
  state: Workflow,
) {
  state.stage = `SecretSpec ${scope} scope membership`;
  try {
    const report: unknown = JSON.parse(
      await state.io.capture(
        tool,
        ["check", "--json", "--scope", scope],
        state.signal,
      ),
    );
    return parseMembers(report);
  } catch (error) {
    if (
      error instanceof CommandFailure &&
      undefinedScope.test(error.diagnostic)
    )
      return [];
    throw error;
  }
}

/**
 * Required values the active profile does not resolve. `check --json` prints
 * its report even when it exits non-zero for a missing required value, so the
 * report is read from the failure; it may touch the provider, but never prompts.
 */
export async function unresolvedRequired(tool: string, state: Workflow) {
  state.stage = "SecretSpec resolution report";
  let text: string;
  try {
    text = await state.io.capture(
      tool,
      ["check", "--json", "--scope", ""],
      state.signal,
    );
  } catch (error) {
    if (!(error instanceof CommandFailure) || !error.output) throw error;
    text = error.output;
    const names = parseUnresolved(JSON.parse(text));
    if (!names.length) throw error;
    return names;
  }
  return parseUnresolved(JSON.parse(text));
}

type ScopeMembers = (scope: string) => Promise<string[]>;

/** Cross-check optional manifest scope metadata, without limiting local delivery. */
export async function checkManifest(members: ScopeMembers, state: Workflow) {
  const names = await members("manifest");
  if (!names.length) return;
  state.stage = "manifest validation";
  const keys = await parseManifestKeys(state.io);
  const missing = names.find((key) => !keys.has(key));
  if (!missing) return;
  state.stage = `manifest declaration for ${missing}`;
  throw new Error("Manifest declaration is missing");
}

function prerequisite(tool: string, state: Workflow) {
  state.stage = `${tool} prerequisite (install and authenticate separately on PATH)`;
  const path = state.io.which(tool);
  if (!path) throw new Error("Missing executable");
  return path;
}

/** The SecretSpec schema, which never carries values. */
async function readSchema(tool: string, state: Workflow) {
  state.stage = "SecretSpec schema";
  const schema: unknown = JSON.parse(
    await state.io.capture(tool, ["schema"], state.signal),
  );
  return schema;
}

/** Names the schema declares, under the rules `variables` applies when it resolves the profile. */
export async function schemaNames(tool: string, state: Workflow) {
  return declaredNames(await readSchema(tool, state));
}

/** SecretSpec reads SECRETSPEC_FILE, SECRETSPEC_PROFILE and the provider from the environment itself. */
async function resolveProfile(tool: string, state: Workflow) {
  const schema = await readSchema(tool, state);
  state.stage = "SecretSpec resolution";
  const exported: unknown = JSON.parse(
    await state.io.capture(
      tool,
      ["export", "--scope", "", "--format", "json"],
      state.signal,
    ),
  );
  state.stage = "resolved value validation";
  return parseResolved(schema, exported);
}

function forgeEnvironment(
  properties: Record<string, unknown>,
  values: Record<string, string>,
  ambient: NodeJS.ProcessEnv,
) {
  const env = { ...ambient };
  for (const key of Object.keys(properties)) delete env[key];
  return Object.assign(env, values);
}

export async function configure(state: Workflow) {
  const secretspec = prerequisite("secretspec", state);
  const forge = prerequisite("forge", state);
  const { properties, values } = await resolveProfile(secretspec, state);
  const environment = values["FORGE_ENVIRONMENT"];
  return {
    forge,
    scopeMembers: (scope: string) => scopeMembers(secretspec, scope, state),
    properties,
    values,
    environment,
    env: forgeEnvironment(properties, values, state.io.env),
  };
}

/** Declared and runtime-scope names from SecretSpec, without resolving any value. */
export async function runtimeNames(state: Workflow) {
  const secretspec = prerequisite("secretspec", state);
  return {
    declared: await schemaNames(secretspec, state),
    runtime: await scopeMembers(secretspec, "runtime", state),
  };
}
