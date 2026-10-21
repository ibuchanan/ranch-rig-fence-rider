import { expect, test } from "bun:test";
import fc from "fast-check";
import { quote, underSecretSpec } from "../src/shell.ts";

test.each([
  { word: "forge", quoted: "forge" },
  { word: "--flag=value", quoted: "--flag=value" },
  { word: "a/b.c:d,e@f%g+h_i-j", quoted: "a/b.c:d,e@f%g+h_i-j" },
  { word: "", quoted: "''" },
  { word: "two words", quoted: "'two words'" },
  { word: "it's", quoted: "'it'\\''s'" },
  { word: "$HOME", quoted: "'$HOME'" },
  { word: "$(id)", quoted: "'$(id)'" },
  { word: "`id`", quoted: "'`id`'" },
  { word: "a;b|c&d", quoted: "'a;b|c&d'" },
  { word: "*", quoted: "'*'" },
  { word: "line\nbreak", quoted: "'line\nbreak'" },
  { word: '"double"', quoted: "'\"double\"'" },
])("quote leaves $word as $quoted", ({ word, quoted }) => {
  expect(quote(word)).toBe(quoted);
});

test("a script replaces the shell with secretspec run over the whole profile", () => {
  expect(underSecretSpec(["forge", "lint"])).toBe(
    `exec secretspec run --scope '' -- forge lint "$@"`,
  );
});

test("each word of the command is quoted and runner arguments come last", () => {
  expect(underSecretSpec(["forge", "lint", "two words", "it's"])).toBe(
    `exec secretspec run --scope '' -- forge lint 'two words' 'it'\\''s' "$@"`,
  );
});

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
