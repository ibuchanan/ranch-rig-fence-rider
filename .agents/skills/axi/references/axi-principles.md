---
okf_version: "0.2.0"
type: Guide
title: "AXI principles and evidence boundaries"
description: "The ten upstream AXI principles, approved adaptations, and benchmark limitations."
sources:
  - id: axi-site
    resource: "https://axi.md/"
    title: "AXI: Agent eXperience Interface"
    author: "human:Kun Chen"
  - id: axi-repository
    resource: "https://github.com/kunchenguid/axi"
    title: "AXI: Agent eXperience Interface"
  - id: axi-github-study
    resource: "https://github.com/kunchenguid/axi/blob/main/bench-github/published-results/STUDY.md"
    title: "AXI Benchmark Study: Agent Interface Comparison"
generated:
  by: agent:rovo
  at: "2026-10-22T17:29:17Z"
---

<!-- markdownlint-configure-file {"MD025": {"front_matter_title": ""}} -->
<!-- cspell:words rovo TOON -->

# AXI principles and evidence boundaries

## Source status

The [AXI website](https://axi.md/) links to the listed upstream repository and
identifies Kun Chen. These are primary sources for the approach and also advocate
its adoption. The inspected landing page does not identify a specification
version or publication date. The website's principles and repository are living
material; the capture date is not their publication date.

## Ten principles

The following summarizes the website's principle sections, not a mandatory
checklist for this skill.

| Principle | Upstream recommendation | Approved adaptation |
| --- | --- | --- |
| 1. Token-efficient output | TOON instead of JSON or tables | TOON for suitable collections when useful; JSON objects and procedural text remain valid |
| 2. Minimal default schemas | Small defaults with explicitly requested detail | Smallest useful schema, without hiding facts needed for the task |
| 3. Content truncation | Bounded previews and a full-content escape hatch | Honest truncation, discoverable retrieval, no misleading completeness |
| 4. Pre-computed aggregates | Counts and cheap derived summaries reduce follow-up calls | Useful, affordable aggregates only; unavailable totals stay unknown |
| 5. Definitive empty states | Explicit zero-result context | Distinguish successful emptiness from failure or missing output |
| 6. Structured errors and exit codes | Idempotence, structured stdout errors, no prompts, rejection of unknown flags | Actionable failures and validation before side effects; explicit channel/exit contract, compatible with existing consumers |
| 7. Ambient context | Session integrations expose relevant state | Optional, opted-in integrations only |
| 8. Content first | No-argument invocation shows live state | Safe, useful, reasonably cheap default; help can be appropriate |
| 9. Contextual disclosure | Relevant next commands instead of an up-front manual | Useful discovery without prescribed workflows or invented values |
| 10. Consistent help | Concise command-specific help | Accurate arguments, defaults, constraints, and examples for the requested surface |

Exact list sizes, preview lengths, flag aliases, harness integrations, and
version fast-path techniques are not universal requirements. The supplied
prototype is not the authority for upstream claims.

## Channel conflict

The website's principle 6 specifies structured errors on stdout and diagnostics
on stderr. This differs from the general CLI convention of errors on stderr.

**Approved adaptation:** the command's channel contract is explicit and tested.
Existing consumers retain their contract unless a breaking change is authorized.
Progress does not contaminate machine-readable output. Claims that agents never
read stderr are not universal assumptions.

## Benchmark provenance and limitations

The website describes two studies totaling **915 runs**:

| Study | Design | Evidence limits |
| --- | --- | --- |
| Browser | 14 tasks × 7 conditions × 5 repeats = 490 runs | Public sites; read/navigation tasks; one agent model and an LLM judge |
| GitHub | 17 tasks × 5 conditions × 5 repeats = 425 runs; study dated March 21, 2026 | One repository, condition-specific agent instructions, one agent model and an LLM judge |

Both use Claude Sonnet 4.6 as agent and judge. The GitHub study compares raw
`gh`, `gh-axi`, and three MCP conditions. Its summary reports AXI succeeding in
85/85 runs at an average cost of $0.050, versus 86% and $0.054 for raw CLI.
These are reported observations for that setup, not reliability guarantees.

The GitHub narrative's ToolSearch comparison quotes 87% versus 98%, inconsistent
with its summary table's 82% versus 87% for the two direct MCP conditions. That
inconsistency is unresolved here; the raw trajectories were not reanalyzed and
neither benchmark was rerun.

The AXI condition combines serialization, summaries, combined operations, and
contextual guidance. It does not isolate TOON's causal contribution. The
website's approximate token-saving claim is not a universal percentage or an
acceptance threshold for this skill.

## Evaluation relevance

Supported scenario themes include count-dependent collection queries,
truncation, empty states, and error recovery. Single-object JSON, procedural
logs, compatibility-preserving retrofits, and fake-backend mutation tests are
approved skill adaptations, not outcomes established by these benchmarks.
