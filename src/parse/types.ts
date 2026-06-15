// Normalized genome schema. Every supported input format maps into this.

export type Genotype = string; // e.g. "AG", "CC", "--" for no-call

export type Chrom =
  | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "10"
  | "11" | "12" | "13" | "14" | "15" | "16" | "17" | "18" | "19" | "20"
  | "21" | "22" | "X" | "Y" | "MT";

export type GenomeSource = "23andme" | "ancestry" | "myheritage" | "vcf" | "unknown";

export interface Variant {
  rsid: string;
  chrom: string; // "1".."22", "X", "Y", "MT"
  pos: number; // build37 bp
  genotype: Genotype;
}

export interface ParsedGenome {
  source: GenomeSource;
  build: "GRCh37";
  method?: string; // e.g. "low-pass WGS" -> drives confidence flagging
  variantCount: number;
  byRsid: Map<string, Variant>;
  byChrom: Map<string, Variant[]>; // sorted by pos
}

export class ParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ParseError";
  }
}
