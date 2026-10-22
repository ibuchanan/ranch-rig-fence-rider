---
okf_version: "0.2.0"
type: Guide
title: "CLI conventions, composition, and compatibility"
description: "Human-first CLI guidelines relevant to agent interfaces, with explicit adaptations."
sources:
  - id: command-line-interface-guidelines
    resource: "https://clig.dev/"
    title: "Command Line Interface Guidelines"
generated:
  by: agent:rovo
  at: "2026-10-22T17:29:17Z"
---

<!-- markdownlint-configure-file {"MD025": {"front_matter_title": ""}} -->
<!-- cspell:words rovo Aanand Prasad Firshman Tashian unrequested TOON -->

# CLI conventions, composition, and compatibility

## Source assessment

[Command Line Interface Guidelines](https://clig.dev/) identifies four authors:
Aanand Prasad, Ben Firshman, Carl Tashian, and Eva Parish. It is openly maintained
practitioner guidance, not a formal compatibility specification or an agent
performance study. No document version or precise update date was established
in this inspection.

Its philosophy is explicitly human-first. Its conventions are valuable for
existing scripts and mixed human/agent use, but interactivity and presentation
advice must not be imported without considering the agent execution context.

## Relevant sections

| Section | Source position | Approved adaptation |
| --- | --- | --- |
| The Basics | Success returns zero; failures nonzero; primary and machine-readable output goes to stdout; messaging and errors go to stderr | Explicit, tested exit/channel contract; existing consumers preserved |
| Help | Discoverable help and useful no-argument behavior | Safe defaults; no mandatory live dashboard |
| Output | JSON when requested; plain output and terminal-aware presentation; no animations in redirected stdout | Task-shaped format; no terminal art contaminating machine-readable results |
| Errors | Clear, actionable diagnostics | Stable distinctions and recovery information without secret leakage |
| Arguments and flags | Consistent, conventional interfaces and explicit input handling | Validation before side effects; no cosmetic breaking changes |
| Interactivity | Prompts only when stdin is a terminal; `--no-input` disables interaction | Complete non-interactive path or clear failure with required flags |
| Robustness | Recoverable behavior and safeguards | No unrequested side effects; failures do not masquerade as success |
| Future-proofing | Interfaces evolve without surprising existing consumers | Existing output, flags, and semantics retained unless changes are authorized |

The Interactivity section explicitly says that required input in no-input mode
should fail with instructions for supplying it as a flag. It does not imply that
missing a terminal supplies consent.

## Channel conflict with AXI

CLI Guidelines sends messages and errors to stderr. AXI's principle 6 places
structured errors on stdout. Both address real consumption patterns, but neither
establishes the existing target CLI's contract.

**Approved adaptation:** the observable contract states where results, progress,
and errors appear, in each supported mode. Tests inspect stdout, stderr, and
exit status separately. Compatibility is preserved; progress remains separate
from machine-readable results. Procedural log output can be plain text.

Terminal detection can select presentation conveniences. It is not evidence of
a caller's identity, permission, or consent, and does not replace an explicit
machine-readable mode when consumers need a stable format.

## Compatibility and test relevance

Public behavior includes field names and types, exit meanings, command and flag
semantics, output channels, and non-interactive operation. A format mode or
separate entry point can preserve an existing contract; neither mechanism is
mandatory in every project.

Useful test cases include redirected output, no-input execution, usage errors
before dependency calls, stable result schemas, clear empty states, and absence
of writes during safe defaults. Safe mutation tests use the replaceable backend
boundary required by the approved specification, not live destructive commands.

## Limits

Human-first conversation patterns are not instructions to add prompts to agent
paths. JSON support is advice, not a mandate to remove useful procedural text or
TOON. This reference does not authorize installation, analytics, configuration
changes, or live operations merely because the original guide discusses them.
