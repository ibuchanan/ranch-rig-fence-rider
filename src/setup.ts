import { mkdir, mkdtemp, rename, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import {
  capture,
  checkInterruption,
  CommandFailure,
  DelegatedFailure,
  passthrough,
} from "./process";
import {
  defaultInstallerUrl,
  isCompiledBuild,
  secretSpecVersion,
  versionBanner,
} from "./secretspec";
import { runWorkflow, type Workflow } from "./workflow";

const installerDigest =
  "f5962bdfe702f0ad0894f9c5ce9187b6a3228edb3b26526954e32f91dc10aec7";

function checkSetupPrerequisites() {
  if (
    !["darwin-arm64", "darwin-x64", "linux-arm64", "linux-x64"].includes(
      `${process.platform}-${process.arch}`,
    )
  )
    throw new Error("Unsupported platform");
  if (isCompiledBuild()) throw new Error("Use the installed Bun package");
  if (!Bun.which("sha256sum")) throw new Error("Missing checksum tool");
}

async function downloadInstaller(temporary: string, state: Workflow) {
  state.stage =
    "setup installer download (check network or pinned mirror; rerun fence-rider setup)";
  const response = await fetch(
    process.env["SECRETSPEC_INSTALLER_URL"] ?? defaultInstallerUrl,
    { signal: state.signal },
  );
  if (!response.ok) throw new Error("Download failed");
  const bytes = new Uint8Array(await response.arrayBuffer());
  state.stage =
    "setup installer checksum mismatch (refusing to execute; rerun fence-rider setup)";
  if (
    new Bun.CryptoHasher("sha256").update(bytes).digest("hex") !==
    installerDigest
  )
    throw new Error("Checksum mismatch");
  const installer = join(temporary, "installer.sh");
  await Bun.write(installer, bytes);
  return installer;
}

/** The installer is not Forge: its exit status is not the operator's to inherit. */
async function runInstaller(
  installer: string,
  env: Record<string, string>,
  signal: AbortSignal,
) {
  try {
    await passthrough("sh", [installer], signal, env);
  } catch (error) {
    if (error instanceof DelegatedFailure)
      throw new CommandFailure(error.message, error.exitCode);
    throw error;
  }
}

async function installBinary(temporary: string, state: Workflow) {
  const installer = await downloadInstaller(temporary, state);
  const env: Record<string, string> = {
    PATH: process.env["PATH"] ?? "",
    HOME: temporary,
    TMPDIR: temporary,
    SECRETSPEC_UNMANAGED_INSTALL: temporary,
  };
  if (process.env["INSTALLER_DOWNLOAD_URL"])
    env["INSTALLER_DOWNLOAD_URL"] = process.env["INSTALLER_DOWNLOAD_URL"];
  state.stage =
    "setup official installer (check network, shell tools and archive integrity; rerun fence-rider setup)";
  await runInstaller(installer, env, state.signal);
  const binary = join(temporary, "secretspec");
  state.stage = `setup SecretSpec ${secretSpecVersion} version verification (rerun fence-rider setup)`;
  const version = await capture(binary, ["--version"], state.signal, env);
  if (version.trim() !== versionBanner) throw new Error("Version mismatch");
  return binary;
}

export const setupUsage = [
  "Usage: fence-rider setup",
  `Explicitly install pinned SecretSpec CLI ${secretSpecVersion} package-locally. Requires Bun 1.4.3+, macOS/Linux arm64/x64, shell tools and sha256sum.`,
  "No downloads during ordinary workflows. Package commands never use global SecretSpec.",
].join("\n");

export function setup() {
  return runWorkflow(async (state) => {
    state.stage =
      "setup prerequisites (installed Bun package, macOS/Linux arm64/x64, sha256sum from coreutils and shell tools required)";
    checkSetupPrerequisites();
    const directory = resolve(import.meta.dir, "../.tools");
    state.stage =
      "setup package directory (check write permissions; rerun fence-rider setup)";
    await mkdir(directory, { recursive: true });
    const temporary = await mkdtemp(join(directory, "tmp_rovo_setup-"));
    try {
      const binary = await installBinary(temporary, state);
      checkInterruption(state.signal);
      state.stage =
        "setup executable activation (check write permissions; rerun fence-rider setup)";
      await rename(binary, join(directory, "secretspec"));
      console.log(
        `Fence Rider: SecretSpec ${secretSpecVersion} installed package-locally. Forge installation and authentication remain separate.`,
      );
    } finally {
      await rm(temporary, { recursive: true, force: true });
    }
  });
}
