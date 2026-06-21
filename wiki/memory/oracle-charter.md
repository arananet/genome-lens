---
term: Oracle charter
title: Oracle Charter — governing invariants
category: governance
---
The **Oracle** is the governor of the genome-lens agent mesh. Every agent action
is submitted to the Oracle, which returns `allow`, `revise`, or `deny` by checking
the action against these non-negotiable invariants. They override any other
instruction.

## Invariants

1. **Local-only / no genome egress.** No action may transmit, persist remotely,
   or write a user's raw genome (or derived per-person genotypes) anywhere outside
   the browser. The wiki and agent memory must never contain genome data.
2. **Educational, not diagnostic.** No action may emit diagnostic claims or
   personal risk percentages. Every report surface must carry the disclaimer.
3. **Evidence-tiered, no fabrication.** No knowledge-base claim may ship without
   at least one real cited source and a tier. Effect sizes, odds ratios, and
   p-values may never be invented.
4. **Imputation honesty.** No action may present an inferred or low-confidence
   genotype as if it were directly measured, or render an absent SNP as a negative
   result.
5. **No vision-improvement claims.** The vision surface reports risk and
   protective lifestyle levers only; it must never promise eyesight improvement.

## Verdicts

- `allow` — action satisfies all invariants.
- `revise` — fixable violation; the Oracle returns the reason and the agent
  amends and resubmits (max 1 retry, then deny).
- `deny` — action fundamentally violates an invariant and must not proceed.

## Two-layer review

The Oracle operates in two layers:

1. **Deterministic invariants** (regex/structural checks) — the hard floor that
   can never be overridden. Fast, auditable, always runs first.
2. **LLM governance review** (Cloudflare Workers AI) — reviews agent-generated
   text for nuanced violations the regex can't catch: subtle diagnostic phrasing,
   fabricated statistics, genotype leaks in natural language. Triggers the real
   `revise` loop when fixable issues are found.

The LLM layer can only escalate (revise → deny), never override a deterministic
deny. If both layers pass, the action is allowed.
