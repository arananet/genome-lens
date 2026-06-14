# The genome-lens LLM-wiki

This folder is a **Karpathy-style LLM-wiki**: a flat collection of plain
Markdown pages that are equally readable by humans and by language-model agents.
It is the single source of truth for two things:

- **`glossary/`** — user-facing genomics definitions. These pages are bundled
  into the app at build time and rendered in the in-app Wiki/Glossary tab.
- **`memory/`** — the agent mesh's durable memory: the Oracle charter, the agent
  roster, and an append-only decision log. Agents read and write these pages
  through `src/mesh/memory.ts`.

## Why Markdown

Markdown is the lowest-friction format an LLM can both read and edit reliably.
No schema migrations, no database, no lock-in — `git` is the history, the diff is
the audit trail. Every page carries a small YAML front-matter block:

```markdown
---
term: SNP
title: Single-Nucleotide Polymorphism (SNP)
category: core
---
Body in Markdown…
```

## Privacy

Nothing in this wiki ever contains a user's genome. It holds project knowledge
and public definitions only. The Oracle enforces this as a hard invariant.
