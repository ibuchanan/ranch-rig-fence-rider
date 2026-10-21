import { expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));

async function fixture(
  scripts: Record<string, string>,
  files: Record<string, string>,
  command: string,
) {
  const directory = mkdtempSync(join(root, "tmp_rovo_check-"));
  try {
    writeFileSync(join(directory, "package.json"), JSON.stringify({ scripts }));
    for (const [name, content] of Object.entries(files))
      writeFileSync(join(directory, name), content, { mode: 0o755 });
    const child = Bun.spawn(["/bin/sh", "-c", command], {
      cwd: directory,
      env: { PATH: `${directory}:${dirname(process.execPath)}:/usr/bin:/bin` },
      stdout: "pipe",
      stderr: "pipe",
    });
    const [exitCode, stdout, stderr] = await Promise.all([
      child.exited,
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
    ]);
    return { exitCode, output: stdout + stderr };
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

test.each([0, 1, 2])(
  "Fallow check exiting %i hides a successful report but preserves failure details and status",
  async (status) => {
    const { scripts } = await Bun.file(join(root, "package.json")).json();
    const result = await fixture(
      { "lint:check:fallow": scripts["lint:check:fallow"] },
      {
        fallow: `#!/bin/sh\nprintf 'SYNTHETIC_FALLOW_REPORT\\n'\nprintf 'SYNTHETIC_FALLOW_DIAGNOSTIC\\n' >&2\nexit ${status}\n`,
      },
      scripts["lint:check:fallow"],
    );
    expect(result.exitCode).toBe(status);
    if (status === 0) {
      expect(result.output).toBe("");
    } else {
      expect(result.output).toContain("SYNTHETIC_FALLOW_REPORT\n");
      expect(result.output).toContain("SYNTHETIC_FALLOW_DIAGNOSTIC\n");
    }
  },
);

test.each([false, true])(
  "check with failing test: %p hides passing tests while keeping failures, totals, and failure status",
  async (fails) => {
    const { scripts } = await Bun.file(join(root, "package.json")).json();
    const result = await fixture(
      { test: scripts.test, "test:check": scripts["test:check"] },
      {
        "sample.test.ts": `import { expect, test } from "bun:test";
          test("synthetic passing case", () => expect(true).toBe(true));
          ${fails ? 'test("synthetic failing case", () => expect(false).toBe(true));' : ""}`,
      },
      "bun run test:check",
    );
    expect(result.exitCode).toBe(fails ? 1 : 0);
    expect(result.output).not.toContain("(pass) synthetic passing case");
    expect(result.output).toContain("1 pass");
    expect(result.output).toContain(fails ? "1 fail" : "0 fail");
    if (fails) expect(result.output).toContain("(fail) synthetic failing case");
  },
);
