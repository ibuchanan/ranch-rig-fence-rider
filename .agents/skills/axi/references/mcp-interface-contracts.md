---
okf_version: "0.2.0"
type: Guide
title: "MCP interface contracts relevant to CLI design"
description: "Verified July 2026 MCP concepts for schema, error, and trust comparisons without importing the protocol."
sources:
  - id: mcp-2026-07-28
    resource: "https://modelcontextprotocol.io/specification/2026-07-28"
    title: "Model Context Protocol Specification"
    author: "org:Model Context Protocol"
  - id: mcp-2026-07-28-tools
    resource: "https://modelcontextprotocol.io/specification/2026-07-28/server/tools"
    title: "Tools"
    author: "org:Model Context Protocol"
generated:
  by: agent:rovo
  at: "2026-10-22T17:29:17Z"
---

<!-- markdownlint-configure-file {"MD025": {"front_matter_title": ""}} -->
<!-- cspell:words rovo -->

# MCP interface contracts relevant to CLI design

## Authority and verified revision

The official [specification][spec] explicitly displays
**Version 2026-07-28**. This is the requested revision, not a silent substitute.
Its overview links the corresponding TypeScript schema as the authoritative
protocol definition. The revision label is not presented here as an independently
verified publication timestamp.

MCP is an open protocol, not a CLI design standard. Its capitalized normative
requirements govern MCP implementations. The CLI comparisons below are design
analogies, not additional MCP requirements or a claim of MCP compliance.

## Transferable contract concepts

| MCP feature | Verified source location | CLI comparison |
| --- | --- | --- |
| Tool discovery | Tools: Capabilities and Listing Tools | Discoverable commands and accurate help describe available operations |
| Input schema | Tools: Data Types / Tool | Arguments have explicit types, required values, and constraints |
| Output schema | Tools: Output Schema | Promised machine-readable results have a testable structure |
| Structured content | Tools: Structured Content | Data representation is explicit, not inferred from terminal decoration |
| Protocol versus execution errors | Tools: Error Handling | Invocation problems differ from failures executing a valid operation |
| Consent and privacy | Specification: Security and Trust & Safety | Interface convenience does not grant authority or consent |
| Untrusted annotations | Tools: Tool and Security Considerations | Descriptive safety hints are not security enforcement |

The inspected tools page describes discovery through `tools/list` and invocation
through `tools/call`. These are protocol method names, not commands an AXI CLI
must provide.

## Results and errors

The tools page defines `inputSchema` and optional `outputSchema`. Structured
results must conform when an output schema is provided. In this revision,
`structuredContent` can be any JSON value conforming to that schema, not only
an object.

The Error Handling section distinguishes:

- **Protocol errors:** problems with the request structure itself.
- **Tool execution errors:** actionable feedback reported in a tool result with
  `isError: true`, suitable for model self-correction.

**Approved adaptation:** CLI usage errors, service failures, and successful empty
results remain distinguishable. They use the CLI's explicit exit and channel
contract; no universal JSON-RPC-to-exit-code mapping follows from MCP.

## Trust and authorization

The specification describes user consent, privacy, access controls, and tool
safety. The tools page warns that annotations must be considered untrusted
unless obtained from trusted servers. Tool descriptions and claims of read-only
or idempotent behavior do not grant authority or prove enforcement.

**Approved adaptation:** validation and authorization remain real boundaries.
Non-interactive execution uses explicit values and existing authorization; it
does not translate confirmation into an unattended prompt. Sensitive live writes
and optional integrations require the approval specified by the skill policy.

MCP's own interaction and elicitation mechanisms do not justify adding prompts
to an agent CLI or removing a human's control over sensitive actions.

## Scope exclusions and evaluation use

This reference does not require an MCP server, a bridge, transport negotiation,
OAuth implementation, or protocol discovery calls in a CLI. Security remains
relevant even though protocol implementation is out of scope.

Schema validation, useful error classes, and distrust of advisory metadata are
useful comparison points for contract reviews. Fake-backend tests are an approved
skill policy, not a requirement established by this MCP source. Historical
claims about eager tool loading or connection state must not be generalized to
all hosts or this revision.

[spec]: https://modelcontextprotocol.io/specification/2026-07-28
