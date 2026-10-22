---
okf_version: "0.2.0"
type: Guide
title: "Writing proportionate interface specifications"
description: "Goal clarity, explicit boundaries, and iterative verification from Addy Osmani's agent specification guidance."
sources:
  - id: osmani-good-spec
    resource: "https://addyosmani.com/blog/good-spec/"
    title: "How to write a good spec for AI agents"
    author: "human:Addy Osmani"
generated:
  by: agent:rovo
  at: "2026-10-22T17:29:17Z"
---

<!-- markdownlint-configure-file {"MD025": {"front_matter_title": ""}} -->
<!-- cspell:words rovo Addy Osmani -->

# Writing proportionate interface specifications

## Source assessment

The [article][article] identifies Addy Osmani and displays
**January 13, 2026**. That is the article's displayed date, not a verified last
modification date. It is practitioner guidance grounded in coding-agent use,
with links to other sources; it is not an AXI specification or a controlled
study of interface contracts.

The page promotes the author's related writing and book. Its secondary research
claims and third-party quotations were not independently verified in this pass.
They are not treated as established empirical results here.

## Relevant source positions

| Article section | Source position | Interface relevance |
| --- | --- | --- |
| 1. Start with a high-level vision | Clear goals and core requirements precede detail; planning permits clarification | Intended user task and observable success anchor the command contract |
| 2. Structure the spec | Concrete commands, testing, structure, style, workflow, and boundaries reduce ambiguity | Examples include exact inputs and expected outputs, not vague aspirations |
| 3. Context management | Smaller relevant pieces avoid overwhelming context | Reference detail is loaded by intent rather than copied into every prompt |
| 4. Domain knowledge and minimalism | Existing knowledge matters; isolated tasks do not need an overbearing spec | Existing service semantics and repository conventions take precedence over invented abstractions |
| 5. Test, iterate, and evolve | Verification and specification refinement are iterative | Observed behavior and contract tests can reveal missing requirements |

The article explicitly includes **Minimalism for simple tasks**. It does not
support requiring a full PRD for every flag or formatting change.

## Approved contract scope

The following is this skill's application of the article, not an externally
mandated document template:

| Contract area | Information that may need definition |
| --- | --- |
| Invocation | Task, command shape, required inputs, defaults, relevant scope |
| Results | Output format, field meanings, empty states, completeness, truncation |
| Failures | Usage versus execution errors, channels, exit meanings, recovery |
| Safety | Authorization, validation before side effects, secret handling |
| Compatibility | Existing callers and behavior that must remain stable |
| Verification | Observable expectations and safe backend substitutes |

For a small change, these facts may fit in the implementation plan and tests.
A persistent design document is useful only when the task warrants one. The
approved skill specification does not require new scaffolding or a separate
specification artifact for each implementation.

## Boundaries on borrowed advice

General advice about recording agent activity does not authorize transcript
capture, analytics, or sensitive log retention. Human-readable boundaries do not
replace runtime enforcement. References to commits or workflow automation do
not grant permission for git writes.

Safe fake-backend testing is an approved project requirement, not a specific
architecture established by this article. Completion reports distinguish tested
behavior, assumptions, and deferred or unavailable verification.

[article]: https://addyosmani.com/blog/good-spec/
