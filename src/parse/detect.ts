import type { GenomeSource } from "./types";

// Detect the consumer-export format from the file's header region.
// We only inspect the first chunk of text — header signatures are distinctive.
export function detectFormat(text: string): GenomeSource {
  const head = text.slice(0, 4096);
  const lower = head.toLowerCase();

  // VCF: standard fileformat meta-line or #CHROM header
  if (/^##fileformat=VCF/i.test(head) || /^#CHROM\tPOS\tID/m.test(head)) {
    return "vcf";
  }

  // MyHeritage: "##" metadata block and a quoted RSID,CHROMOSOME,POSITION,RESULT header.
  if (
    lower.includes("myheritage") ||
    (head.includes("##") && /"?rsid"?\s*,\s*"?chromosome"?/i.test(head) && /"?result"?/i.test(head))
  ) {
    return "myheritage";
  }

  // AncestryDNA: "AncestryDNA" banner and allele1/allele2 columns (tab-separated).
  if (
    lower.includes("ancestrydna") ||
    /rsid\tchromosome\tposition\tallele1\tallele2/i.test(head) ||
    /allele1\s+allele2/i.test(head)
  ) {
    return "ancestry";
  }

  // 23andMe: "23andMe" banner and "# rsid chromosome position genotype" header.
  if (
    lower.includes("23andme") ||
    /#?\s*rsid\tchromosome\tposition\tgenotype/i.test(head) ||
    (head.includes("# rsid") && lower.includes("genotype"))
  ) {
    return "23andme";
  }

  return "unknown";
}
