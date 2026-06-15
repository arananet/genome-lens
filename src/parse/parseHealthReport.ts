// Parser for GWAS / multivariate health report text exports.
// Detects condition-level risk verdicts from structured report text
// organized by medical system category + analysis methodology.

export type GwasVerdict =
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

export interface GwasFinding {
  condition: string;
  category: string;
  methodology: "GWAS" | "multivariate" | "monovariate";
  verdict: GwasVerdict;
  snps: Array<{ rsid: string; genotype: string }>;
  pubmedUrl?: string;
}

export interface ParsedHealthReport {
  totalConditions: number;
  findings: GwasFinding[];
}

const CATEGORY_HEADERS: Record<string, string> = {
  "GWAS Complex Diseases: Neurology": "Neurology",
  "GWAS Complex Diseases: Circulatory System": "Circulatory System",
  "GWAS Complex Diseases: Respiratory System": "Respiratory",
  "GWAS Complex Diseases: Musculoskeletal System": "Musculoskeletal",
  "GWAS Complex Diseases: Endocrinology": "Endocrinology",
  "GWAS Complex Diseases: Urogenital System": "Urogenital",
  "GWAS Complex Diseases: Dermatology": "Dermatology",
  "GWAS Complex Diseases: Others": "Other Diseases",
  "Complex Diseases: Oncogenic Mutations": "Oncogenic Mutations",
  "Complex Diseases: Multivariate Analysis": "Complex Diseases",
  "Viruses, Bacteria and Fungi": "Infectious Diseases",
  "Allergies and Intolerances": "Allergies & Intolerances",
  "Biomarkers and Others": "Biomarkers",
  Pharmacogenetics: "Pharmacogenetics",
  "Hereditary Diseases": "Hereditary Diseases",
};

const VERDICT_PATTERNS: Array<[RegExp, GwasVerdict]> = [
  [/more likely to[\s\S]{1,150}?suffer from this/i, "elevated"],
  [/less likely to[\s\S]{1,150}?suffer from this/i, "reduced"],
  [/predisposition similar to most/i, "average"],
  [/propensity similar to most/i, "average"],
  [/detected at least one mutation[\s\S]{1,80}?pathogenic/i, "flagged_pathogenic"],
  [/not detected any pathogenic mutation/i, "clear"],
  [/harmful effect on you/i, "drug_harmful"],
  [/abnormal effect on you/i, "drug_abnormal"],
  [/respond positively to this drug/i, "drug_positive"],
  [/not found anything in your genetics[\s\S]{1,80}?abnormal/i, "drug_clear"],
  [/suffer abnormal levels/i, "elevated_biomarker"],
  [/better predisposition than the majority[\s\S]{1,80}?normal levels/i, "reduced_biomarker"],
  [/similar predisposition to the majority[\s\S]{1,80}?normal levels/i, "average_biomarker"],
];

const SKIP_PREFIXES = [
  "Gene",
  "SNP",
  "Genotype",
  "Your genetic map",
  "GWAS analysis",
  "Multivariate analysis",
  "Monovariate analysis",
  "More information",
  "What do your genetics",
  "According to this",
  "We have not detected",
  "We have detected",
  "not valid for clinical",
  "This report is",
  "Caption",
  "www.",
  "http",
];

const SNP_RE = /\b(rs\d+)\s+([ACGT]{1,3})\b/g;
const PUBMED_RE = /(?:pubmed|PMC)\/?(\d+)/i;

function detectMethodology(
  block: string,
): "GWAS" | "multivariate" | "monovariate" {
  if (/Monovariate analysis/i.test(block)) return "monovariate";
  if (/Multivariate analysis/i.test(block)) return "multivariate";
  return "GWAS";
}

function extractConditionName(
  block: string,
  categoryKeys: string[],
): string | null {
  const beforeMap = block.split("Your genetic map")[0] ?? block;
  const lines = beforeMap.split("\n");

  let pastCategory = false;
  for (const line of lines) {
    const s = line.trim();
    if (!s || s.length < 3) continue;

    if (categoryKeys.some((k) => s.includes(k))) {
      pastCategory = true;
      continue;
    }
    if (!pastCategory) continue;

    if (SKIP_PREFIXES.some((p) => s.startsWith(p))) continue;
    if (/^[A-Z0-9_-]{2,12}\s+rs\d+/.test(s)) continue;
    if (/^[ACGT]{2,3}$/.test(s)) continue;
    if (/Page \d+ of/.test(s)) continue;
    if (s.length < 4 || s.length > 90) continue;

    return s;
  }
  return null;
}

export function detectHealthReport(text: string): boolean {
  const head = text.slice(0, 8000).toLowerCase();
  return (
    head.includes("gwas") &&
    head.includes("genetic") &&
    (head.includes("complex diseases") || head.includes("health report")) &&
    /predisposition/i.test(head)
  );
}

export function parseHealthReport(text: string): ParsedHealthReport {
  const pageBlocks = text.split(
    /This report is not valid for clinical or diagnostic use\.\s*Page \d+ of \d+/,
  );

  const categoryKeys = Object.keys(CATEGORY_HEADERS);
  let currentCat = "Unknown";
  const findings: GwasFinding[] = [];
  const seen = new Set<string>();

  for (const block of pageBlocks) {
    for (const key of categoryKeys) {
      if (block.includes(key)) {
        currentCat = CATEGORY_HEADERS[key];
      }
    }

    if (!block.includes("What do your genetics tell us?")) continue;

    const verdictSection = block.split("What do your genetics tell us?").pop()!;
    let verdict: GwasVerdict | null = null;
    for (const [re, v] of VERDICT_PATTERNS) {
      if (re.test(verdictSection)) {
        verdict = v;
        break;
      }
    }
    if (!verdict) continue;

    // Skip clear/drug_clear hereditary findings — they're noise (hundreds of them)
    if (
      currentCat === "Hereditary Diseases" &&
      (verdict === "clear" || verdict === "drug_clear")
    ) {
      continue;
    }

    const conditionName = extractConditionName(block, categoryKeys);
    if (!conditionName) continue;

    const key = `${currentCat}::${conditionName}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const snps: Array<{ rsid: string; genotype: string }> = [];
    let m: RegExpExecArray | null;
    const snpRe = new RegExp(SNP_RE.source, SNP_RE.flags);
    while ((m = snpRe.exec(block)) !== null) {
      snps.push({ rsid: m[1], genotype: m[2] });
    }

    const pubmedMatch = PUBMED_RE.exec(block);
    const methodology = detectMethodology(block);

    findings.push({
      condition: conditionName,
      category: currentCat,
      methodology,
      verdict,
      snps,
      pubmedUrl: pubmedMatch
        ? `https://pubmed.ncbi.nlm.nih.gov/${pubmedMatch[1]}`
        : undefined,
    });
  }

  const totalConditions = pageBlocks.filter((b) =>
    b.includes("What do your genetics tell us?"),
  ).length;

  return { totalConditions, findings };
}
