import { expect, test } from "bun:test";
import { root } from "../../support/cli.ts";
import { realSecretSpec } from "../../support/fixtures.ts";

test.skipIf(!realSecretSpec)(
  "the provider guide and canonical scripts work with synthetic values and fake Forge",
  async () => {
    const child = Bun.spawn(["bash", "scripts/check-secretspec.sh"], {
      cwd: root,
      stdin: "ignore",
      stdout: "pipe",
      stderr: "pipe",
    });
    const [status, stdout, stderr] = await Promise.all([
      child.exited,
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
    ]);
    expect(status, stderr).toBe(0);
    expect(stdout).toContain("PASS: provider setup");
  },
  30_000,
);
