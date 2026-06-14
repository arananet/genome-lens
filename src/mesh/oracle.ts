import type { AgentAction, OracleRuling, Verdict } from "./types";

// The Oracle governs the mesh: every agent action is checked against the
// non-negotiable invariants from wiki/memory/oracle-charter.md. Verdicts:
// allow (compliant), revise (fixable), deny (fundamental violation).

interface Violation {
  invariant: string;
  reason: string;
  verdict: Exclude<Verdict, "allow">;
}

type Check = (a: AgentAction) => Violation | null;

// Heuristic: does a blob of text look like it carries a personal genotype call?
// e.g. "rs9939609 = AA" or "rs6025: GG". Used to block genome egress.
function looksLikeGenotype(text: string): boolean {
  return /rs\d+\s*[:=]\s*[ACGT-]{2}/i.test(text) || /\bgenotype\b.*\b[ACGT]{2}\b/i.test(text);
}

const SEVERITY: Record<Verdict, number> = { allow: 0, revise: 1, deny: 2 };

const CHECKS: Check[] = [
  // 1. Local-only / no genome egress.
  (a) => {
    if (a.kind !== "data-egress") return null;
    const transmitsGenome = a.payload.transmitsGenome === true;
    const body = String(a.payload.body ?? "");
    if (transmitsGenome || looksLikeGenotype(body)) {
      return {
        invariant: "local-only",
        verdict: "deny",
        reason: "Action would transmit raw genome or a personal genotype off-device.",
      };
    }
    return null;
  },
  // 2. Educational, not diagnostic.
  (a) => {
    if (a.kind !== "report-copy") return null;
    const text = String(a.payload.text ?? "");
    if (/\b\d{1,3}\s?%\s*(risk|chance|probability)\b/i.test(text)) {
      return {
        invariant: "no-diagnosis",
        verdict: "revise",
        reason: "Personal risk percentages are not allowed; report associations and tiers instead.",
      };
    }
    if (/\byou (have|are diagnosed with|will develop)\b/i.test(text)) {
      return {
        invariant: "no-diagnosis",
        verdict: "revise",
        reason: "Diagnostic phrasing detected; keep copy educational and non-diagnostic.",
      };
    }
    return null;
  },
  // 3. Evidence-tiered, no fabrication.
  (a) => {
    if (a.kind !== "kb-entry") return null;
    const sources = a.payload.sources;
    const tier = a.payload.tier;
    if (!Array.isArray(sources) || sources.length < 1) {
      return {
        invariant: "evidence-required",
        verdict: "deny",
        reason: "Knowledge-base entries require at least one cited source.",
      };
    }
    if (tier !== "A" && tier !== "B" && tier !== "C") {
      return {
        invariant: "evidence-required",
        verdict: "deny",
        reason: "Knowledge-base entries require a tier of A, B, or C.",
      };
    }
    return null;
  },
  // 4. Imputation honesty.
  (a) => {
    if (a.payload.presentsInferredAsMeasured === true) {
      return {
        invariant: "imputation-honesty",
        verdict: "revise",
        reason: "Inferred/low-confidence calls must not be presented as directly measured.",
      };
    }
    return null;
  },
  // 5. No vision-improvement claims.
  (a) => {
    if (a.kind !== "report-copy") return null;
    if (a.payload.category !== "vision") return null;
    const text = String(a.payload.text ?? "");
    if (/\b(improve|restore|fix|cure)\b[^.]*\b(eyesight|vision)\b/i.test(text)) {
      return {
        invariant: "no-vision-improvement",
        verdict: "deny",
        reason: "The vision surface must not promise eyesight improvement.",
      };
    }
    return null;
  },
];

export class Oracle {
  // Evaluate an action against all invariants, returning the most severe ruling.
  rule(action: AgentAction): OracleRuling {
    let worst: Violation | null = null;
    for (const check of CHECKS) {
      const v = check(action);
      if (v && (!worst || SEVERITY[v.verdict] > SEVERITY[worst.verdict])) {
        worst = v;
      }
    }
    if (!worst) return { verdict: "allow" };
    return { verdict: worst.verdict, invariant: worst.invariant, reason: worst.reason };
  }
}

export const oracle = new Oracle();
