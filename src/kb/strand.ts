// Strand utilities for comparing uploaded genotypes against the KB's
// forward (+) build37 effect allele.

const COMPLEMENT: Record<string, string> = {
  A: "T",
  T: "A",
  C: "G",
  G: "C",
};

export function complementBase(base: string): string {
  return COMPLEMENT[base.toUpperCase()] ?? base.toUpperCase();
}

// Reverse-complement a short allele string (handles single bases and indels).
export function reverseComplement(seq: string): string {
  let out = "";
  for (let i = seq.length - 1; i >= 0; i--) {
    out += complementBase(seq[i]);
  }
  return out;
}

// Count copies of the (forward-strand) effect allele in a genotype like "AG".
// "--" no-calls return 0. Genotype bases are assumed forward-strand vs build37
// for the vendors we support; see KB entry orientation docs.
export function countEffectAllele(genotype: string, effectAlleleFwd: string): number {
  if (!genotype || genotype === "--") return 0;
  const effect = effectAlleleFwd.toUpperCase();
  let count = 0;
  for (const base of genotype.toUpperCase()) {
    if (base === effect) count += 1;
  }
  return count;
}

// Normalize a genotype to a canonical, order-independent key (e.g. "GA" -> "AG").
export function canonicalGenotype(genotype: string): string {
  if (!genotype || genotype === "--") return "--";
  return genotype.toUpperCase().split("").sort().join("");
}
