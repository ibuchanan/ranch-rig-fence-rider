import { expect, test } from "bun:test";
import { rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { makeScratchDir, root } from "../../support/cli.ts";

const { scripts } = await Bun.file(join(root, "package.json")).json();

test.each([
  [0, 0],
  [1, 0],
  [0, 1],
])(
  "check runs directly and propagates lint=%i and test:check=%i failures",
  async (lintStatus, testStatus) => {
    expect(scripts.check).not.toContain("lefthook");
    const directory = makeScratchDir("tmp_rovo_check-");
    try {
      writeFileSync(
        join(directory, "package.json"),
        JSON.stringify({
          scripts: {
            check: scripts.check,
            lint: `echo LINT_TASK; exit ${lintStatus}`,
            "test:check": `echo TEST_TASK; exit ${testStatus}`,
          },
        }),
      );
      writeFileSync(
        join(directory, "lefthook"),
        "#!/bin/sh\necho UNEXPECTED_HOOK_INVOCATION >&2\nexit 99\n",
        { mode: 0o755 },
      );
      const child = Bun.spawn([process.execPath, "run", "--bun", "check"], {
        cwd: directory,
        env: {
          ...process.env,
          PATH: `${directory}:${join(root, "node_modules/.bin")}:${dirname(process.execPath)}:${process.env["PATH"] ?? ""}`,
        },
        stdout: "pipe",
        stderr: "pipe",
        timeout: 5_000,
      });
      const [status, stdout, stderr] = await Promise.all([
        child.exited,
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
      ]);
      const output = stdout + stderr;
      expect(output).not.toContain("UNEXPECTED_HOOK_INVOCATION");
      expect(child.signalCode).toBeNull();
      expect(status).toBe(lintStatus || testStatus ? 1 : 0);
      if (!lintStatus && !testStatus) {
        expect(output).toContain("LINT_TASK");
        expect(output).toContain("TEST_TASK");
      }
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  },
);
