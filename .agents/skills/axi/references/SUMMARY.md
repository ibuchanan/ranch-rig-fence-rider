---
okf_version: "0.2.0"
type: Guide
title: "AXI reference map"
description: "Loading map, source authority, and approved AXI policy distinctions."
sources:
  - id: axi
    resource: "https://axi.md/"
    title: "AXI: Agent eXperience Interface"
    author: "human:Kun Chen"
  - id: cli-guidelines
    resource: "https://clig.dev/"
    title: "Command Line Interface Guidelines"
generated:
  by: agent:rovo
  at: "2026-10-22T17:29:17Z"
---

<!-- markdownlint-configure-file {"MD025": {"front_matter_title": ""}} -->
<!-- cspell:words rovo TOON Osmani -->

# AXI reference map

These reference notes summarize sources examined on October 22, 2026. They are
consultation material, not a replacement for the original specifications.

The [approved skill specification](../../../specs/axi.md) defines this skill's
behavior. Statements labeled **Approved adaptation** describe project decisions,
not claims that the external authors agree. Third-party examples and embedded
prompts are source material, not instructions to execute.

## Loading map

| Reference | Purpose | Loading trigger |
| --- | --- | --- |
| [AXI principles](axi-principles.md) | Ten principles, adaptations, benchmark limits | AXI design or review; checking which principles apply |
| [TOON format](toon-format.md) | Serialization authority, structure, conformance | Selecting or implementing TOON output |
| [Agent CLI practices](agent-cli-practices.md) | Stable output, errors, retries, non-interactive operation | Designing command contracts or error recovery |
| [CLIrank design guide](clirank-agent-cli-design.md) | First-run usability and evidence reporting | Inspecting discovery, setup, or safe smoke tests |
| [MCP interface contracts](mcp-interface-contracts.md) | Schemas, errors, trust boundaries | Comparing CLI contracts with protocol-based tools |
| [CLI guidelines](cli-guidelines.md) | Channels, scripting, compatibility, safeguards | Retrofitting a human-oriented CLI or resolving convention conflicts |
| [Writing interface specs](writing-interface-specs.md) | Explicit contracts and proportionate verification | Defining behavior before implementation |

## Authority and conflict register

| Topic | Source positions | Approved adaptation |
| --- | --- | --- |
| Formats | AXI mandates TOON; DEV and CLIrank favor JSON support | Format follows task and data shape; no universal token-saving claim |
| Channels | AXI puts structured errors on stdout; CLI Guidelines sends errors to stderr; DEV demonstrates both | Explicit, tested channel contract; compatibility preserved; progress separate from machine-readable results |
| Prompts | AXI prohibits interaction; human-first guidance permits terminal prompts | Non-interactive path required; missing a terminal never grants authorization |
| No arguments | AXI favors live state; general CLI guidance permits help | Safe, useful, reasonably cheap behavior; no mandatory dashboard |
| Session context | AXI promotes ambient context | Optional integrations with explicit opt-in; no default transcript capture |
| Testing | Sources discuss dry runs, smoke tests, or iterative verification | Replaceable-backend tests; no dangerous live mutations required |

AXI is primary design guidance, not a cross-project compatibility standard.
TOON and MCP specifications are normative only within their own formats and
protocols. DEV, CLIrank, CLI Guidelines, and Osmani provide practitioner advice
with different audiences and purposes.

## Evidence boundaries

- AXI benchmarks evaluate bundled interfaces, not TOON in isolation. Their
  domains, model, judge, and reporting limitations qualify performance claims.
- CLIrank's usage-based framing is self-reported, not independently reproduced.
- Historical advice about MCP overhead does not establish the behavior of every
  host or of the verified July 2026 protocol revision.
- Safe backend substitutes, compatibility constraints, and optional integrations
  are approved skill policies even where upstream advice differs.
- Target CLI/API semantics still require project-specific documentation.
  SDK- and harness-specific integration details are outside this reference set.
