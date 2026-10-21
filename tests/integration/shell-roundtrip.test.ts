import { expect, test } from "bun:test";
import fc from "fast-check";
import { quote } from "../../src/shell.ts";

test("every word, however hostile, round-trips through sh as one argument", async () => {
  // A batch of generated cases in one shell, since a spawn per case is slow.
  const words = fc
    .sample(
      fc.oneof(
        fc.string(),
        fc.string({ unit: "binary-ascii" }),
        fc.string({ unit: "grapheme" }),
        fc.constantFrom(
          "'",
          "''",
          "\\",
          "\\'",
          "$",
          "`",
          "!",
          "-n",
          "--",
          "~",
          "*",
          "?",
          "a b",
          "\n",
          "\t",
        ),
      ),
      400,
    )
    .filter((word) => !word.includes("\u0000"));
  const script = words
    .map((word) => `printf '%s\\0' ${quote(word)}`)
    .join("\n");
  const child = Bun.spawn(["/bin/sh", "-c", script], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const [status, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  expect({ status, stderr }).toEqual({ status: 0, stderr: "" });
  expect(stdout.split("\u0000").slice(0, -1)).toEqual(words);
});
