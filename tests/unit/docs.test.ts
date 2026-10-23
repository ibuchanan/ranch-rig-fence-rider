import { expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { root } from "../support/cli.ts";
import { runMain } from "../support/main.ts";

const commands = [
  "deploy",
  "variables",
  "lint",
  "install",
  "uninstall",
  "tunnel",
  "doctor",
];
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
    const help = await runMain(["help", command]);
    const page = readFileSync(helpPage, "utf8");
    expect(page).toContain(`\`\`\`text\n${help.stdout.trimEnd()}\n\`\`\``);
  },
);

const otherDocs = markdownFiles(docsRoot).filter((file) => file !== helpPage);
const usageCases = commands.flatMap((command) =>
  otherDocs.map((file) => [command, relative(root, file)] as const),
);

test.each(usageCases)(
  "usage text for %s does not appear in %s",
  async (command, file) => {
    const help = await runMain(["help", command]);
    const page = readFileSync(join(root, file), "utf8").replace(/\s+/g, " ");
    const repeated = help.stdout
      .trimEnd()
      .split("\n")
      .filter(
        (line) =>
          line.endsWith(".") && page.includes(line.replace(/\s+/g, " ")),
      );
    expect(repeated).toEqual([]);
  },
);
