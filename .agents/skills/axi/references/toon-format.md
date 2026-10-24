---
okf_version: "0.2.0"
type: Guide
title: "TOON format selection and conformance"
description: "Verified TOON specification authority and relevant serialization considerations."
sources:
  - id: toon-specification-index
    resource: "https://toonformat.dev/reference/spec.html"
    title: "Specification"
  - id: toon-specification
    resource: "https://github.com/toon-format/spec/blob/main/SPEC.md"
    title: "TOON Specification"
    last_modified: "2026-10-08"
generated:
  by: agent:rovo
  at: "2026-10-22T17:29:17Z"
---

<!-- markdownlint-configure-file {"MD025": {"front_matter_title": ""}} -->
<!-- cspell:words rovo TOON Schopplich -->

# TOON format selection and conformance

## Authority and version

The official [specification index](https://toonformat.dev/reference/spec.html)
identifies the linked [SPEC.md][spec] as authoritative for encoders, decoders,
and validators. The inspected document states **Version 4.4**, dated
**October 8, 2026**. The website navigation displays implementation version
`4.4.0`; that is not the specification's stated version string.

The specification defines Token-Oriented Object Notation over the JSON data
model. It is maintained in the official `toon-format` repository. The website
attributes copyright to Johann Schopplich; that does not establish sole
individual authorship of every specification revision.

## Relevant format properties

| Property                      | Source section  | Relevance                                                                |
| ----------------------------- | --------------- | ------------------------------------------------------------------------ |
| JSON data model               | §2              | Serialization need not dictate internal domain representations           |
| Encoding normalization        | §3              | Non-JSON host values need documented treatment                           |
| Strings and keys              | §7              | Delimiters, quoting, escapes, and ambiguous scalar-like strings matter   |
| Objects                       | §8              | TOON supports objects as well as collections                             |
| Arrays and tabular forms      | §9              | Uniform records can declare fields once rather than repeat them per row  |
| Delimiters and whitespace     | §§11–12         | Output cannot rely on ad hoc comma joining or arbitrary indentation      |
| Conformance and decode errors | §§13–14         | Correctness includes validation, not merely visual resemblance           |
| Security                      | §15             | Structured serialization is not a trust or authorization boundary        |
| Versioning and fixtures       | §18, Appendix C | Implementations have version-specific contracts and conformance evidence |

In version 4.4, tabular columns can include nested-uniform object groups. It
would be inaccurate to reduce all valid tabular TOON to flat records only.
Array headers describe the serialized array's length, not an invented backend
total. Pagination metadata and retrieval hints are separate interface concerns.

## Approved format policy

TOON is preferred for table-like collections **when it meaningfully reduces
repetition**. JSON is acceptable for single objects; plain-text logs are
acceptable for procedural operations. None of these choices alone establishes
AXI compliance or agent task success.

Serialization occurs at the output boundary. The approved policy does not
require a new encoder, a particular SDK, or replacing an existing JSON contract.
The selected repository implementation and its supported specification version
remain project-specific facts.

## Contract test considerations

Relevant fixture categories include delimiters inside values, quotes and
newlines, empty arrays, nulls, boolean-like strings, Unicode, and nested values.
For output claimed to be TOON, useful evidence includes successful decoding and
agreement with the intended JSON-model values, alongside the implementation's
conformance fixtures. Large and paginated results also need honest completeness
metadata outside the serialization syntax.

## Evidence limits

This source is normative for syntax, not a comparative study of CLI task
performance. Token savings depend on data shape, tokenizer, and comparison
format. No universal percentage is adopted here. The notes summarize selected
sections; exact versioned syntax remains the original specification's concern.

[spec]: https://github.com/toon-format/spec/blob/main/SPEC.md
