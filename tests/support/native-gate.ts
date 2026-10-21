/**
 * Runs once before the suite. Native tests need real SecretSpec on PATH. Without
 * it, a plain run skips them and says so; the forced gate sets
 * FENCE_RIDER_REQUIRE_NATIVE=1 (see `test:check` in package.json) and fails.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const testedVersion = "0.21.1";

if (!Bun.which("secretspec")) {
  const directory = join(import.meta.dir, "..", "integration");
  const skipped = readdirSync(directory)
    .filter((name) => name.endsWith(".test.ts"))
    .reduce(
      (count, name) =>
        count +
        readFileSync(join(directory, name), "utf8").split(
          "skipIf(!realSecretSpec)",
        ).length -
        1,
      0,
    );
  if (process.env["FENCE_RIDER_REQUIRE_NATIVE"] === "1") {
    console.error(
      `SecretSpec ${testedVersion} is required on PATH for this gate, but secretspec was not found. ${skipped} native test declarations cannot run. Install SecretSpec ${testedVersion}, or run \`bun run test\` to skip them.`,
    );
    process.exit(1);
  }
  console.warn(
    `SecretSpec not found on PATH: skipping ${skipped} native test declarations (table cases count individually in the totals below). Install SecretSpec ${testedVersion} to run them.`,
  );
}
