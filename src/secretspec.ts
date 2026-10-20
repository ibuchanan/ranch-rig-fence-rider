import { resolve } from "node:path";

/** The only definition of the pinned SecretSpec release. */
export const secretSpecVersion = "0.21.1";
export const versionBanner = `secretspec ${secretSpecVersion}`;
export const defaultInstallerUrl = `https://github.com/cachix/secretspec/releases/download/v${secretSpecVersion}/secretspec-installer.sh`;

export const isCompiledBuild = () => import.meta.path.startsWith("/$bunfs/");

/** Where the executable lives and whether its version must be verified. */
export function locateSecretSpec(options: {
  compiled: boolean;
  sourceDir: string;
}) {
  return options.compiled
    ? { path: undefined, verifyVersion: false }
    : {
        path: resolve(options.sourceDir, "../.tools/secretspec"),
        verifyVersion: true,
      };
}
