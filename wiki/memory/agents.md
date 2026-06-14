---
term: Agent roster
title: Agent roster
category: governance
---
The mesh is a small set of specialized agents, each with a single
responsibility. All of them share this wiki as memory and are governed by the
Oracle.

| Agent | Responsibility |
|---|---|
| `kb-curator` | Adds/edits knowledge-base entries. Must attach sources + tier. |
| `parser-smith` | Maintains the format parsers and normalizer. |
| `glossary-scribe` | Writes and updates `wiki/glossary/` pages. |
| `ui-polisher` | Improves the UI without changing data semantics. |
| `privacy-warden` | Audits that no path leaks genome data; advises the Oracle. |

Agents communicate by appending notes to the [decision log](#decision-log) and by
reading each other's pages. No agent may bypass the Oracle.
