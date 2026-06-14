export type KbCategory =
  | "pharmacogenomic"
  | "disease-risk"
  | "trait"
  | "fitness"
  | "body-composition"
  | "vision";

export type Tier = "A" | "B" | "C";

export interface KbSource {
  db: string;
  id: string;
  url: string;
}

export interface KbEffect {
  metric: "OR" | "beta" | "note";
  value?: number;
  unit?: string;
}

export interface KbEntry {
  rsid: string;
  gene: string;
  category: KbCategory;
  effectAlleleFwd: string; // forward-strand build37 effect allele
  genotypeInterpretation: Record<string, string>; // "AG" -> plain-language note
  effect?: KbEffect;
  tier: Tier;
  sources: KbSource[]; // >= 1 required
  caveats: string; // mandatory
  // Optional grouping for multi-SNP findings (e.g. APOE) reported together.
  group?: string;
}
