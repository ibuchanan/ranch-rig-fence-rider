<!-- cspell:words promptfoo promptfooconfig sonnet anthropic SDK TOON -->
<!-- cspell:words evals rovo -->

# AXI evaluation suite

## Coverage

This suite compares five review scenarios with and without the AXI skill:

| Scenario | Expected distinction |
| --- | --- |
| Collection query | Compact output, honest partial results/truncation, usable discovery |
| Single object | Suitable JSON is retained without compulsory TOON conversion |
| Procedural operation | Useful logs remain; machine-readable output stays separate |
| Existing retrofit | Compatibility and fake-backend mutation testing take priority |
| Backend-only near miss | Correct retry-loop review without AXI activation or CLI redesign |

The approved evaluation plan is in [the specification](../../../specs/axi.md).
Expected behavior comes from the current [skill](../SKILL.md) and its
[reference map](../references/SUMMARY.md). These are paired review decisions,
not end-to-end implementation tests. No executable target CLI is provided.

## Configuration

Both providers use `claude-sonnet-4-6`, the same inert working directory, the same
request and response schema, read-only tools, and no user/project settings.
Only `axi-with-skill` loads the local `axi-eval` plugin. The positive scenarios
do not explicitly name AXI in a demand to invoke the skill. The baseline has no
plugin and does not discover skills.

The plugin's `SKILL.md` and `references` entries are relative symbolic links to
the current source, not snapshots. No user-level installation is performed.
Plugin discovery and filtering are context controls, not a filesystem sandbox;
a deliberately targeted file read could still reach source files. The requests
provide all task facts and do not direct the baseline to those files. If a
future trajectory shows baseline contamination, the comparison is invalid.

Only local read tools are allowed. Bash, file edits, and web tools are blocked;
there is no target service, credential fixture, deployment, or mutation to run.
The plugin contains no hooks, MCP servers, or executable integrations.

## Assertions and interpretation

- `Routing`: native successful skill invocation for positive with-skill cases;
  no invocation for the near miss or baseline. This proves routing only.
- `ResponseContract`: deterministic structural checks on the review response.
  This does not validate an implemented CLI's output schema.
- `ReadOnlyTools`: provider tool-call metadata contains no forbidden tool
  attempts. Missing metadata fails as unverified, not silently safe. This is
  evidence about observed tool calls, not OS-level isolation.
- `InterfaceQuality`: a scenario-specific model rubric evaluates all response
  fields. The pinned judge uses temperature 0 and a 0.8 threshold. No exact
  phrase, mandatory TOON mention, or particular JSON field must carry an idea.

Each scenario has two rows with identical request and rubric variables. Only
provider selection and routing expectations differ. Content criteria are passed
to the grader, not to the subject. Routing and quality have separate metric names;
compare `InterfaceQuality` across providers rather than interpreting routing as
quality lift. Both providers may pass because the base model already handles a
case well. High agreement alone does not demonstrate skill value.

Human review remains necessary for format suitability, scope discipline, and
justified exceptions. The judge can be wrong and agent behavior can vary across
repeats even at a fixed judge temperature. Inspect actual responses and tool
metadata before changing a skill or a brittle assertion.

## Prerequisites for a later run

- An installed Promptfoo version supporting the Claude Agent SDK provider,
  local plugins, structured output, and `skill-used` assertions.
- Claude Code/Agent SDK support compatible with those settings. The documented
  `skills` filter requires SDK 0.2.120 or later.
- `ANTHROPIC_API_KEY` configured securely in the invoking environment. The agent
  and explicitly pinned Anthropic judge both need usable authentication. No
  credentials are loaded from a committed fixture or embedded in YAML.
- A checkout that preserves symbolic links and the sibling skill/reference files.

The suite was authored without installing or executing Promptfoo or calling
models. Provider compatibility and actual routing remain unverified until run.
The configured $1 budget is per subject execution, not a suite-wide cap, and
excludes separate grading calls. There are ten subject calls and up to ten
model-graded checks per pass; repeating multiplies both.

## Commands for a later run

From the repository root, after confirming prerequisites and authorizing costs:

```bash
promptfoo validate -c skills/axi/evals/promptfooconfig.yaml
promptfoo eval -c skills/axi/evals/promptfooconfig.yaml --no-cache --repeat 3 -o .scratch/tmp_rovo_axi-results.json
```

These are handoff commands, not evidence that validation or evaluation was run.
Result files can contain model output and should not be committed; remove the
temporary report when no longer needed. Human inspection should compare routing,
content quality, false activation, and whether the baseline read the skill.

## Repository validation caveat

`bun run lint:check:skills` invokes Promptfoo evaluations automatically when an
eval config exists; `bun run lint` includes that command. Neither is a static-only
check for this skill anymore. The authoring pass deliberately uses separate
Markdown, spelling, skill-metadata, reference-metadata, and YAML checks instead.
It does not modify the repository's validation scripts to hide this behavior.
