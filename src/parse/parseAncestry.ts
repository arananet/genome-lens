import { forEachLine } from "./lines";
import { buildGenome, normalizeChrom, normalizeGenotype } from "./normalizer";
import { ParseError, type ParsedGenome, type Variant } from "./types";

// AncestryDNA raw export: tab-separated, '#'-prefixed header block,
// columns: rsid  chromosome  position  allele1  allele2
// allele1 + allele2 are joined into a single genotype.
export function parseAncestry(text: string): ParsedGenome {
  const variants: Variant[] = [];

  forEachLine(text, (line) => {
    if (line.length === 0 || line.charCodeAt(0) === 35 /* # */) return;
    const cols = line.split("\t");
    if (cols.length < 5) return;
    // Skip the column header row if present.
    if (cols[0].toLowerCase() === "rsid") return;
    const chrom = normalizeChrom(cols[1]);
    const pos = parseInt(cols[2], 10);
    if (chrom === null || Number.isNaN(pos)) return;
    const a1 = cols[3].trim();
    const a2 = cols[4].trim();
    variants.push({
      rsid: cols[0].trim(),
      chrom,
      pos,
      genotype: normalizeGenotype(`${a1}${a2}`),
    });
  });

  if (variants.length === 0) {
    throw new ParseError("No AncestryDNA variant rows found.");
  }
  return buildGenome("ancestry", variants);
}
