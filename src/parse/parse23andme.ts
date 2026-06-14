import { forEachLine } from "./lines";
import { buildGenome, normalizeChrom, normalizeGenotype } from "./normalizer";
import { ParseError, type ParsedGenome, type Variant } from "./types";

// 23andMe raw export: tab-separated, '#'-prefixed header/comment lines,
// columns: rsid  chromosome  position  genotype
export function parse23andme(text: string): ParsedGenome {
  const variants: Variant[] = [];

  forEachLine(text, (line) => {
    if (line.length === 0 || line.charCodeAt(0) === 35 /* # */) return;
    const cols = line.split("\t");
    if (cols.length < 4) return;
    const chrom = normalizeChrom(cols[1]);
    const pos = parseInt(cols[2], 10);
    if (chrom === null || Number.isNaN(pos)) return;
    variants.push({
      rsid: cols[0].trim(),
      chrom,
      pos,
      genotype: normalizeGenotype(cols[3]),
    });
  });

  if (variants.length === 0) {
    throw new ParseError("No 23andMe variant rows found.");
  }
  return buildGenome("23andme", variants);
}
