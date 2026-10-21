import { expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { root, runCli, useBuiltCli } from "./support/cli.ts";

useBuiltCli();

const commands = ["deploy", "lint", "install", "uninstall", "tunnel"];
const docsRoot = join(root, "docs");
const helpPage = join(docsRoot, "reference", "command-help.md");

function markdownFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? markdownFiles(join(directory, entry.name))
      : entry.name.endsWith(".md")
        ? [join(directory, entry.name)]
        : [],
  );
}

test.each(commands)(
  "the command help page embeds the CLI help for %s verbatim",
  async (command) => {
    const help = await runCli(["help", command], true);
    const page = readFileSync(helpPage, "utf8");
    expect(page).toContain(`\`\`\`text\n${help.stdout.trimEnd()}\n\`\`\``);
  },
);

test("usage text lives only in the command help page", async () => {
  const others = markdownFiles(docsRoot).filter((file) => file !== helpPage);
  for (const command of commands) {
    const help = await runCli(["help", command], true);
    for (const line of help.stdout.trimEnd().split("\n")) {
      for (const file of others)
        expect(readFileSync(file, "utf8").replace(/\s+/g, " ")).not.toContain(
          line.replace(/\s+/g, " "),
        );
    }
  }
});
