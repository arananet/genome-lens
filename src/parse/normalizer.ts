import type { GenomeSource, ParsedGenome, Variant } from "./types";

const VALID_CHROMS = new Set([
  "1", "2", "3", "4", "5", "6", "7", "8", "9", "10",
  "11", "12", "13", "14", "15", "16", "17", "18", "19", "20",
  "21", "22", "X", "Y", "MT",
]);

// Normalize chromosome labels across vendors:
// 23/24/25 -> X/Y/MT, "chr1" -> "1", "M"/"MT" -> "MT".
export function normalizeChrom(raw: string): string | null {
  let c = raw.trim().toUpperCase();
  if (c.startsWith("CHR")) c = c.slice(3);
  if (c === "23") c = "X";
  else if (c === "24") c = "Y";
  else if (c === "25" || c === "26" || c === "M") c = "MT";
  return VALID_CHROMS.has(c) ? c : null;
}

// Normalize a genotype to uppercase; map vendor no-call markers to "--".
export function normalizeGenotype(raw: string): string {
  const g = raw.trim().toUpperCase();
  if (g === "" || g === "--" || g === "00" || g === "NN" || g === "??") return "--";
  return g;
}

// Build the ParsedGenome from a flat list of variants, indexing by rsid and chrom.
export function buildGenome(
  source: GenomeSource,
  variants: Variant[],
  method?: string,
): ParsedGenome {
  const byRsid = new Map<string, Variant>();
  const byChrom = new Map<string, Variant[]>();

  for (const v of variants) {
    if (v.rsid && v.rsid !== ".") byRsid.set(v.rsid, v);
    let bucket = byChrom.get(v.chrom);
    if (!bucket) {
      bucket = [];
      byChrom.set(v.chrom, bucket);
    }
    bucket.push(v);
  }

  for (const bucket of byChrom.values()) {
    bucket.sort((a, b) => a.pos - b.pos);
  }

  return {
    source,
    build: "GRCh37",
    method,
    variantCount: variants.length,
    byRsid,
    byChrom,
  };
}
