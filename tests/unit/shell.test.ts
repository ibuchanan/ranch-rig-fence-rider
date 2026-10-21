import { expect, test } from "bun:test";
import { quote, underSecretSpec } from "../../src/shell.ts";

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
