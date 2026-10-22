---
okf_version: "0.2.0"
type: Guide
title: "Agent CLI practices from Ugo Enyioha"
description: "Practitioner guidance on output, recovery, retries, and command discovery, with safety qualifications."
sources:
  - id: enyioha-agent-clis
    resource: "https://dev.to/uenyioha/writing-cli-tools-that-ai-agents-actually-want-to-use-39no"
    title: "Writing CLI Tools That AI Agents Actually Want to Use"
    author: "human:Ugo Enyioha"
    last_modified: "2026-02-28"
generated:
  by: agent:rovo
  at: "2026-10-22T17:29:17Z"
---

<!-- markdownlint-configure-file {"MD025": {"front_matter_title": ""}} -->
<!-- cspell:words rovo Enyioha clis -->

# Agent CLI practices from Ugo Enyioha

## Source assessment

The [article][article] presents lessons from the author's agent workflows,
including migrations between MCP and CLI approaches. DEV's article API confirms
publication on **February 27, 2026**, and editing on **February 28, 2026**.

Its authority is practitioner experience, not a controlled comparative study.
The article provides concrete examples but no reproducible evaluation of the
eight rules' individual effects. Its claims about MCP overhead describe its
context, not all hosts or later protocol revisions.

## Eight rules and applicable distinctions

| Article section | Source recommendation | Qualification for this skill |
| --- | --- | --- |
| 1. Structured Output Is Not Optional | JSON mode, stable types, stdout data, stderr messages, JSONL for streams | Format remains task-shaped; progress stays separate in machine-readable modes |
| 2. Exit Codes Are the Agent's Control Flow | Document success, usage, not-found, permission, and conflict statuses | Stable semantics matter; its particular 0–5 mapping is not mandatory |
| 3. Make Commands Idempotent | Retry-friendly operations and desired-state commands | Retry safety depends on actual service semantics; uncertain writes must not be blindly replayed |
| 4. Help | Self-documenting command help with examples and constraints | Accurate, scoped help is part of the observable contract |
| 5. Composition | Quiet output, explicit stdin support, batch operations | Additional flags or bulk operations are task-dependent, not automatic scope expansion |
| 6. Provide Dry-Run and Confirmation Bypass | Structured previews and non-interactive execution flags | Bypass flags do not grant authorization; dry runs must not mutate |
| 7. Errors Should Be Actionable | Stable error types, relevant failing input, recovery advice, retry distinctions | Sensitive inputs need redaction; retry advice must be truthful |
| 8. Use Consistent Noun-Verb Grammar | Predictable hierarchical discovery | Existing command compatibility takes precedence over cosmetic renaming |

The article's error example combines stderr diagnostics with structured stdout
errors in JSON mode. This is more nuanced than a rule that all errors belong on
only one channel.

## Safety conflict

Section 6 permits either skipping prompts automatically in non-interactive
terminals or failing with a flag hint. Automatic skipping can be unsafe for
mutations.

**Approved adaptation:** absent input or a missing terminal does not authorize
an operation. Required values and authorization remain necessary; an agent path
must complete with flags or fail clearly rather than wait for a prompt.

The article's `--force` examples are not blanket permission to weaken safeguards.
Idempotence, dry runs, and actual authorization are separate properties.

## Evidence and evaluation use

The article supplies useful example patterns for stable field types, streaming
output, documented statuses, discoverable flags, and recovery paths. Its
idempotence discussion also recognizes conflicts; desired state must be checked,
not inferred merely from an already-existing resource name.

Safe fake-backend mutation testing and compatibility preservation come from the
approved specification, not a demonstrated testing seam in this article.

[article]: https://dev.to/uenyioha/writing-cli-tools-that-ai-agents-actually-want-to-use-39no
