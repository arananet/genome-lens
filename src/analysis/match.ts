import { loadKnowledgeBase } from "../kb/loader";
import type { KbEntry } from "../kb/types";
import { canonicalGenotype, countEffectAllele } from "../kb/strand";
import type { ParsedGenome } from "../parse/types";
import type { Finding } from "./types";

const APOE_KEY_RSID = "rs429358";

function isLowPass(method?: string): boolean {
  return !!method && /low.?pass/i.test(method);
}

// Look up the interpretation for a genotype, trying the canonical (sorted) key
// then the raw key, falling back to a copies-based description.
function interpretationFor(entry: KbEntry, genotype: string): string {
  const canon = canonicalGenotype(genotype);
  const map = entry.genotypeInterpretation;
  if (map[canon]) return map[canon];
  if (map[genotype]) return map[genotype];
  const copies = countEffectAllele(genotype, entry.effectAlleleFwd);
  return `Carries ${copies} copy/copies of the ${entry.effectAlleleFwd} effect allele at ${entry.rsid}.`;
}

// Match the genome against the full knowledge base, returning one Finding per
// KB entry (covered and not-covered alike, so the UI can show "not covered").
export function matchGenome(genome: ParsedGenome): Finding[] {
  const kb = loadKnowledgeBase();
  const lowPass = isLowPass(genome.method);
  const apoeKeyMissing = !genome.byRsid.has(APOE_KEY_RSID);

  return kb.entries.map((entry) => {
    const variant = genome.byRsid.get(entry.rsid) ?? null;
    const covered = variant !== null;

    if (!covered) {
      return {
        entry,
        variant: null,
        genotype: null,
        copies: null,
        interpretation: "Not covered — this position is absent from your file. This is not a negative result.",
        covered: false,
        noCall: false,
        lowConfidence: false,
        indeterminate: false,
      };
    }

    const genotype = variant.genotype;
    const noCall = genotype === "--";
    const copies = noCall ? null : countEffectAllele(genotype, entry.effectAlleleFwd);
    // APOE ε-status cannot be determined without rs429358 present.
    const indeterminate = entry.group === "APOE" && apoeKeyMissing;

    let interpretation: string;
    if (noCall) {
      interpretation = "No-call ('--') at this position — genotype could not be read reliably.";
    } else if (indeterminate) {
      interpretation = "Indeterminate — APOE ε-genotype needs rs429358, which is absent from your file.";
    } else {
      interpretation = interpretationFor(entry, genotype);
    }

    return {
      entry,
      variant,
      genotype: noCall ? "--" : canonicalGenotype(genotype),
      copies,
      interpretation,
      covered: true,
      noCall,
      lowConfidence: lowPass || noCall,
      indeterminate,
    };
  });
}

export function coveredFindings(findings: Finding[]): Finding[] {
  return findings.filter((f) => f.covered);
}

export function findingsByCategory(findings: Finding[], category: KbEntry["category"]): Finding[] {
  return findings.filter((f) => f.entry.category === category);
}

// Tier ordering for display: A first, then B, then C.
const TIER_ORDER: Record<string, number> = { A: 0, B: 1, C: 2 };
export function sortByTier(findings: Finding[]): Finding[] {
  return [...findings].sort((a, b) => TIER_ORDER[a.entry.tier] - TIER_ORDER[b.entry.tier]);
}
