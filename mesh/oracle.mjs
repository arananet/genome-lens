// Server-side Oracle — enforces the same five invariants as src/mesh/oracle.ts.
// Used to gate every agent action during the server-side enrichment pipeline.

function looksLikeGenotype(text) {
  return /rs\d+\s*[:=]\s*[ACGT-]{2}/i.test(text) || /\bgenotype\b.*\b[ACGT]{2}\b/i.test(text);
}

const SEVERITY = { allow: 0, revise: 1, deny: 2 };

const CHECKS = [
  // 1. Local-only / no genome egress
  (a) => {
    if (a.kind !== "data-egress") return null;
    const body = String(a.payload?.body ?? "");
    if (a.payload?.transmitsGenome || looksLikeGenotype(body)) {
      return {
        invariant: "local-only",
        verdict: "deny",
        reason: "Action would transmit raw genome or a personal genotype off-device.",
      };
    }
    return null;
  },
  // 2. Educational, not diagnostic
  (a) => {
    if (a.kind !== "report-copy") return null;
    const text = String(a.payload?.text ?? "");
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
  // 3. Evidence-tiered — every KB entry must cite a source
  (a) => {
    if (a.kind !== "kb-entry") return null;
    if (!Array.isArray(a.payload?.sources) || a.payload.sources.length < 1) {
      return {
        invariant: "evidence-required",
        verdict: "deny",
        reason: "Knowledge-base entries require at least one cited source.",
      };
    }
    return null;
  },
  // 4. Imputation honesty
  (a) => {
    if (a.payload?.presentsInferredAsMeasured) {
      return {
        invariant: "imputation-honesty",
        verdict: "revise",
        reason: "Inferred/low-confidence calls must not be presented as directly measured.",
      };
    }
    return null;
  },
  // 5. No vision-improvement claims
  (a) => {
    if (a.kind !== "report-copy" || a.payload?.category !== "vision") return null;
    const text = String(a.payload?.text ?? "");
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

export function oracleRule(action) {
  let worst = null;
  for (const check of CHECKS) {
    const v = check(action);
    if (v && (!worst || SEVERITY[v.verdict] > SEVERITY[worst.verdict])) {
      worst = v;
    }
  }
  if (!worst) return { verdict: "allow" };
  return { verdict: worst.verdict, invariant: worst.invariant, reason: worst.reason };
}
