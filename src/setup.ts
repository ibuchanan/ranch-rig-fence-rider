import { mkdir, mkdtemp, rename, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { reportConfiguredFailure } from "./configured";
import {
  capture,
  checkInterruption,
  passthrough,
  workflowInterruption,
} from "./process";

const installerDigest =
  "f5962bdfe702f0ad0894f9c5ce9187b6a3228edb3b26526954e32f91dc10aec7";
type SetupState = { stage: string; signal: AbortSignal };

function checkSetupPrerequisites() {
  if (
    !["darwin-arm64", "darwin-x64", "linux-arm64", "linux-x64"].includes(
      `${process.platform}-${process.arch}`,
    )
  )
    throw new Error("Unsupported platform");
  if (import.meta.path.startsWith("/$bunfs/"))
    throw new Error("Use the installed Bun package");
  if (!Bun.which("sha256sum")) throw new Error("Missing checksum tool");
}

async function downloadInstaller(temporary: string, state: SetupState) {
  state.stage =
    "setup installer download (check network or pinned mirror; rerun fence-rider setup)";
  const response = await fetch(
    process.env["SECRETSPEC_INSTALLER_URL"] ??
      "https://github.com/cachix/secretspec/releases/download/v0.21.1/secretspec-installer.sh",
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

async function installBinary(temporary: string, state: SetupState) {
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
  await passthrough("sh", [installer], state.signal, env);
  const binary = join(temporary, "secretspec");
  state.stage =
    "setup SecretSpec 0.21.1 version verification (rerun fence-rider setup)";
  const version = await capture(binary, ["--version"], state.signal, env);
  if (version.trim() !== "secretspec 0.21.1")
    throw new Error("Version mismatch");
  return binary;
}

export async function setup() {
  const interruption = workflowInterruption();
  const state = {
    stage:
      "setup prerequisites (installed Bun package, macOS/Linux arm64/x64, sha256sum from coreutils and shell tools required)",
    signal: interruption.signal,
  };
  let temporary: string | undefined;
  try {
    checkSetupPrerequisites();
    const directory = resolve(import.meta.dir, "../.tools");
    state.stage =
      "setup package directory (check write permissions; rerun fence-rider setup)";
    await mkdir(directory, { recursive: true });
    temporary = await mkdtemp(join(directory, "tmp_rovo_setup-"));
    const binary = await installBinary(temporary, state);
    checkInterruption(state.signal);
    state.stage =
      "setup executable activation (check write permissions; rerun fence-rider setup)";
    await rename(binary, join(directory, "secretspec"));
    console.log(
      "Fence Rider: SecretSpec 0.21.1 installed package-locally. Forge installation and authentication remain separate.",
    );
    return 0;
  } catch (error) {
    return reportConfiguredFailure(error, state, "setup");
  } finally {
    if (temporary) await rm(temporary, { recursive: true, force: true });
    interruption.dispose();
  }
}
