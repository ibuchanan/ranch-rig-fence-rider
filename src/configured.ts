import { resolve } from "node:path";
import { capture } from "./process";
import {
  configuredEnvironment,
  manifestKeys,
  members,
  parseInheritance,
  parseResolved,
  parseScopes,
  type Specification,
} from "./resolution";
import { secretSpecVersion, versionBanner } from "./secretspec";
import type { Workflow } from "./workflow";

/**
 * Names declared in manifest.yml, read from the working directory (the Forge
 * app root), which need not be the directory holding the SecretSpec file.
 */
async function parseManifestKeys() {
  return manifestKeys(Bun.YAML.parse(await Bun.file("manifest.yml").text()));
}

/** Cross-check optional manifest scope metadata, without limiting local delivery. */
export async function checkManifest(
  config: Specification,
  properties: Record<string, unknown>,
  state: Workflow,
) {
  state.stage = "manifest validation";
  if (!config.scopes?.["manifest"]) return;
  const keys = await parseManifestKeys();
  const missing = members(config, "manifest", properties).find(
    (key) => !keys.has(key),
  );
  if (!missing) return;
  state.stage = `manifest declaration for ${missing}`;
  throw new Error("Manifest declaration is missing");
}

function prerequisite(tool: string, state: Workflow) {
  state.stage = `${tool} prerequisite (install and authenticate separately on PATH)`;
  const path = Bun.which(tool);
  if (!path) throw new Error("Missing executable");
  return path;
}

async function readConfiguration(state: Workflow) {
  state.stage = "configuration";
  const file = resolve(process.env["SECRETSPEC_FILE"] ?? "secretspec.toml");
  const profile = process.env["SECRETSPEC_PROFILE"] ?? "default";
  const raw: unknown = Bun.TOML.parse(await Bun.file(file).text());
  state.stage = "project.extends validation (only a single file is supported)";
  parseInheritance(raw);
  state.stage = "scope metadata validation";
  const config = parseScopes(raw);
  return { config, nativeArgs: ["--file", file, "--profile", profile] };
}

async function resolveProfile(
  tool: string,
  nativeArgs: string[],
  state: Workflow,
) {
  state.stage = "SecretSpec schema";
  const schema: unknown = JSON.parse(
    await capture(tool, ["schema", ...nativeArgs], state.signal),
  );
  state.stage = "SecretSpec resolution";
  const exported: unknown = JSON.parse(
    await capture(
      tool,
      ["export", ...nativeArgs, "--scope", "", "--format", "json"],
      state.signal,
    ),
  );
  state.stage = "resolved value validation";
  return parseResolved(schema, exported);
}

function forgeEnvironment(
  properties: Record<string, unknown>,
  values: Record<string, string>,
) {
  const env = { ...process.env };
  for (const key of Object.keys(properties)) delete env[key];
  return Object.assign(env, values);
}

export async function configure(state: Workflow) {
  const secretspec = prerequisite("secretspec", state);
  state.stage = `SecretSpec ${secretSpecVersion} required on PATH (install or switch to that version)`;
  const version = await capture(secretspec, ["--version"], state.signal);
  if (version.trim() !== versionBanner)
    throw new Error("Incompatible executable");
  const forge = prerequisite("forge", state);
  const { config, nativeArgs } = await readConfiguration(state);
  const { properties, values } = await resolveProfile(
    secretspec,
    nativeArgs,
    state,
  );
  state.stage =
    "environment control validation (FORGE_ENVIRONMENT and FORGE_ENV conflict)";
  const environment = configuredEnvironment(values);
  return {
    forge,
    config,
    properties,
    values,
    environment,
    env: forgeEnvironment(properties, values),
  };
}
