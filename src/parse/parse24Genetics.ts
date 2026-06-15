// Parser for 24Genetics "Health report" text files (extracted from the PDF).
//
// The report is ~1020 pages. Each *detailed* condition lives on its own page,
// delimited by a page footer. A detail page carries:
//   - a category header (e.g. "GWAS Complex Diseases: Neurology")
//   - the condition name
//   - a "Your genetic map" table of Gene / SNP / Genotype rows
//   - a pre-computed verdict block under "What do your genetics tell us?"
//   - an optional PubMed / Orphanet "More information" URL
//
// We do not re-compute any genetics here — we surface 24Genetics' own verdicts.
// Summary/legend pages (which list many conditions and all three caption
// phrases at once) are skipped: only pages that carry the per-condition
// "What do your genetics tell us?" block are treated as findings.

export type Verdict24G =
  | "elevated"
  | "reduced"
  | "average"
  | "flagged_pathogenic"
  | "clear"
  | "drug_harmful"
  | "drug_abnormal"
  | "drug_positive"
  | "drug_clear"
  | "elevated_biomarker"
  | "reduced_biomarker"
  | "average_biomarker";

export interface Finding24G {
  condition: string;
  category: string;
  verdict: Verdict24G;
  snps: Array<{ rsid: string; genotype: string }>;
  pubmedUrl?: string;
}

export interface ParsedReport24G {
  source: "24genetics";
  totalConditions: number;
  findings: Finding24G[];
}

// Detect the 24Genetics health report by its recurring footer/header line.
export function detect24Genetics(text: string): boolean {
  return /24Genetics Health report/i.test(text);
}

// Map a raw category header (longest / most specific prefixes first) to a
// display category.
const CATEGORY_MAP: Array<[RegExp, string]> = [
  [/GWAS Complex Diseases:\s*Neurology/i, "Neurology"],
  [/GWAS Complex Diseases:\s*Circulatory System/i, "Circulatory System"],
  [/GWAS Complex Diseases:\s*Respiratory System/i, "Respiratory"],
  [/GWAS Complex Diseases:\s*Musculoskeletal System/i, "Musculoskeletal"],
  [/GWAS Complex Diseases:\s*Endocrinology/i, "Endocrinology"],
  [/GWAS Complex Diseases:\s*Urogenital System/i, "Urogenital"],
  [/GWAS Complex Diseases:\s*Dermatology/i, "Dermatology"],
  [/GWAS Complex Diseases:\s*Others/i, "Other Diseases"],
  [/Complex Diseases:\s*Oncogenic Mutations/i, "Oncogenic Mutations"],
  [/Complex Diseases:\s*Multivariate Analysis/i, "Complex Diseases"],
  [/Viruses,\s*Bacteria and Fungi/i, "Infectious Diseases"],
  [/Allergies and Intolerances/i, "Allergies & Intolerances"],
  [/Biomarkers and Others/i, "Biomarkers"],
  [/Pharmacogenetics/i, "Pharmacogenetics"],
  [/Hereditary Diseases/i, "Hereditary Diseases"],
];

// The category header sits at the very top of a detail page. We resolve it
// from the first header line that appears, so a page only maps to one category.
function categoryFor(block: string): string | null {
  let best: { idx: number; label: string } | null = null;
  for (const [re, label] of CATEGORY_MAP) {
    const m = block.match(re);
    if (m && m.index !== undefined) {
      if (best === null || m.index < best.idx) best = { idx: m.index, label };
    }
  }
  return best?.label ?? null;
}

// Lines that are page boilerplate, never a condition name.
const BOILERPLATE = [
  /your genetic map/i,
  /gwas analysis/i,
  /multivariate analysis/i,
  /what do your genetics tell us/i,
  /more information/i,
  /this report is not valid/i,
  /24Genetics Health report/i,
  /^gene\b/i,
  /^snp\b/i,
  /^genotype\b/i,
  /^caption\b/i,
  /^according to/i,
  /^based on your genotype/i,
  /^depending on your genotype/i,
  /^patients with/i,
  /^page \d+ of/i,
  /complex diseases/i,
  /gwas complex diseases/i,
  /viruses, bacteria/i,
  /allergies and intolerances/i,
  /biomarkers and others/i,
  /pharmacogenetics/i,
  /hereditary diseases/i,
];

// Mutation-screening verdicts shared by Hereditary + Oncogenic pages.
function mutationVerdict(block: string): Verdict24G | null {
  // The SNP table is interleaved with the verdict sentence, so allow a short
  // run of intervening characters between key phrases.
  if (/detected at least one[\s\S]{0,60}?mutation[\s\S]{0,40}?pathogenic/i.test(block))
    return "flagged_pathogenic";
  if (/not detected any pathogenic[\s\S]{0,60}?mutation/i.test(block)) return "clear";
  return null;
}

// Biomarker pages express the verdict in terms of "normal levels".
function biomarkerVerdict(block: string): Verdict24G | null {
  if (/more prone[\s\S]{0,120}?to suffering abnormal levels/i.test(block))
    return "elevated_biomarker";
  if (/suffer abnormal levels/i.test(block)) return "elevated_biomarker";
  if (/more prone[\s\S]{0,120}?to having normal levels/i.test(block))
    return "reduced_biomarker";
  if (/better predisposition than the majority[\s\S]{0,120}?normal levels/i.test(block))
    return "reduced_biomarker";
  if (/propensity is to[\s\S]{0,120}?have normal levels/i.test(block))
    return "average_biomarker";
  if (/similar predisposition to the majority[\s\S]{0,120}?normal levels/i.test(block))
    return "average_biomarker";
  return null;
}

// Pharmacogenetics detail pages are descriptive ("Patients with the X
// genotype may…"). The clean "harmful/abnormal/positive" phrasing only lives
// in the report legend, so for detail pages we infer from response keywords.
function drugVerdict(block: string): Verdict24G | null {
  if (/harmful effect on you/i.test(block)) return "drug_harmful";
  if (/respond positively to this drug/i.test(block)) return "drug_positive";
  if (/abnormal effect on you/i.test(block)) return "drug_abnormal";
  if (/not found anything in your genetics/i.test(block)) return "drug_clear";
  // Detail-page heuristics.
  if (/(increased risk of toxicity|poorer response|greater risk|more likely to respond)/i.test(block))
    return /more likely to respond/i.test(block) ? "drug_positive" : "drug_harmful";
  // Any other described drug–gene interaction is flagged as an abnormal response.
  if (/patients with[\s\S]{0,80}?genotype/i.test(block)) return "drug_abnormal";
  return null;
}

// GWAS / infectious / allergy pages express a predisposition verdict.
function predispositionVerdict(block: string): Verdict24G | null {
  if (/more likely to[\s\S]{1,400}?suffer from this/i.test(block)) return "elevated";
  if (/less likely to[\s\S]{1,400}?suffer from this/i.test(block)) return "reduced";
  if (/more predisposed to[\s\S]{1,200}?suffer/i.test(block)) return "elevated";
  if (/less predisposed to[\s\S]{1,200}?suffer/i.test(block)) return "reduced";
  if (/more prone than the average person to suffer/i.test(block)) return "elevated";
  if (/(high|greater) predisposition to/i.test(block)) return "elevated";
  if (/(low|lower) predisposition to/i.test(block)) return "reduced";
  if (/not (particularly )?predisposed to/i.test(block)) return "reduced";
  if (/predisposition similar to most/i.test(block)) return "average";
  if (/propensity similar to that of most/i.test(block)) return "average";
  if (/predisposition[\s\S]{0,40}?is (standard|average)/i.test(block)) return "average";
  // A bare "predisposed to <X>" with no qualifier reads as elevated.
  if (/you are predisposed to/i.test(block)) return "elevated";
  return null;
}

// Resolve the verdict for a page, biasing the matcher by category so the
// right family of phrasings is consulted.
function detectVerdict(block: string, category: string): Verdict24G | null {
  if (category === "Hereditary Diseases" || category === "Oncogenic Mutations") {
    return mutationVerdict(block) ?? predispositionVerdict(block);
  }
  if (category === "Biomarkers") {
    return biomarkerVerdict(block) ?? predispositionVerdict(block);
  }
  if (category === "Pharmacogenetics") {
    return drugVerdict(block);
  }
  return (
    predispositionVerdict(block) ??
    mutationVerdict(block) ??
    biomarkerVerdict(block)
  );
}

// Pull the condition name: first non-boilerplate, reasonably sized line that
// appears before the "Your genetic map" table on the page. The condition sits
// on the line(s) directly after the category header.
function extractCondition(block: string): string | null {
  const beforeMap = block.split(/your genetic map/i)[0] ?? block;
  const lines = beforeMap.split("\n");
  for (const raw of lines) {
    const line = raw.trim();
    if (line.length < 5 || line.length > 80) continue;
    if (BOILERPLATE.some((re) => re.test(line))) continue;
    if (/\brs\d+\b/.test(line)) continue; // SNP table fragment
    return line;
  }
  return null;
}

function extractSnps(block: string): Array<{ rsid: string; genotype: string }> {
  const out: Array<{ rsid: string; genotype: string }> = [];
  const seen = new Set<string>();
  const re = /(rs\d+)\s+([ACGT]{1,3})\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(block)) !== null) {
    const rsid = m[1];
    if (seen.has(rsid)) continue;
    seen.add(rsid);
    out.push({ rsid, genotype: m[2] });
  }
  return out;
}

function extractPubmed(block: string): string | undefined {
  const m = block.match(/(?:https?:\/\/)?(?:www\.)?ncbi\.nlm\.nih\.gov\/pubmed\/\d+/i);
  if (m) {
    const url = m[0];
    return url.startsWith("http") ? url : `https://${url}`;
  }
  return undefined;
}

const FOOTER = /This report is not valid for clinical or diagnostic use\.\s*Page \d+ of 1020/i;

export function parse24Genetics(text: string): ParsedReport24G {
  const blocks = text.split(FOOTER);
  const findings: Finding24G[] = [];

  for (const block of blocks) {
    // Only per-condition detail pages carry this header; summary/legend pages
    // do not. This filters out the report's intro and summary sections.
    if (!/what do your genetics tell us/i.test(block)) continue;

    const category = categoryFor(block);
    if (!category) continue;

    // Verdict phrases are line-wrapped and interleaved with the SNP table, so
    // detect them against a whitespace-collapsed copy of the page.
    const flat = block.replace(/\s+/g, " ");
    const verdict = detectVerdict(flat, category);
    if (!verdict) continue;

    const condition = extractCondition(block);
    if (!condition) continue;

    // Hereditary "clear" results are noise — 800+ identical negatives.
    if (
      category === "Hereditary Diseases" &&
      (verdict === "clear" || verdict === "drug_clear")
    ) {
      continue;
    }

    findings.push({
      condition,
      category,
      verdict,
      snps: extractSnps(block),
      pubmedUrl: extractPubmed(block),
    });
  }

  return {
    source: "24genetics",
    totalConditions: findings.length,
    findings,
  };
}
