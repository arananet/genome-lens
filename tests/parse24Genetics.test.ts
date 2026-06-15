import { describe, expect, it } from "vitest";
import {
  detect24Genetics,
  parse24Genetics,
} from "../src/parse/parse24Genetics";

// A compact fixture that mirrors the 24Genetics PDF-extraction layout:
// per-condition detail pages, each ended by the recurring footer line. The
// SNP table bleeds into the verdict block exactly as it does in the real file.
const FIXTURE = `
GWAS Complex Diseases: Neurology

  Parkinson's disease

  Parkinson's Disease is a movement disorder.                       Your genetic map

                                                                    Gene     SNP            Genotype
                                                                    GBA      rs35749011     GG
                                                                    NUCKS1   rs823118       CC

  GWAS analysis

 What do your genetics tell us?

                         According to this study, you are less likely to
                         suffer from this disease than most of the
                         population.

 More information:
 www.ncbi.nlm.nih.gov/pubmed/25064009

                  This report is not valid for clinical or diagnostic use.   Page 32 of 1020
                                24Genetics Health report for Olivia. 356556


GWAS Complex Diseases: Circulatory System

  Hodgkin's lymphoma

  A description of the disease here.                                Your genetic map

                                                                    Gene     SNP            Genotype
                                                                    IL13     rs20541        GG

 What do your genetics tell us?

                         According to this study, you are more likely to
                         suffer from this disease than most of the population.

 More information:

                  This report is not valid for clinical or diagnostic use.   Page 40 of 1020
                                24Genetics Health report for Olivia. 356556


Complex Diseases: Oncogenic Mutations

  BRCA1: breast and ovarian cancer

  BRCA1 gene mutations may be related to disease.                  Your genetic map

                                                                   BRCA1    rs80357147     TT
 What do your genetics tell us?

                          We have not detected any pathogenic          BRCA1    rs80356875     CC
                          mutations, but, since we only analyse a part of the gene,
                          you could have a pathogenic mutation in non-analysed regions.

 More information:

                  This report is not valid for clinical or diagnostic use.   Page 90 of 1020
                                24Genetics Health report for Olivia. 356556


Complex Diseases: Multivariate Analysis

  gastric cancer

  A description here.                                              Your genetic map

                                                                   GENE1    rs111111       AA
 What do your genetics tell us?

                          We have detected at least one mutation that could be pathogenic.

 More information:

                  This report is not valid for clinical or diagnostic use.   Page 95 of 1020
                                24Genetics Health report for Olivia. 356556


Biomarkers and Others

  Calcium levels

  Calcium is vital.                                               Your genetic map

                                                                   CASR     rs1801725      GG
 What do your genetics tell us?

                         According to this study, your propensity is to
                         have normal levels, in line with the average person.

 More information:
 www.ncbi.nlm.nih.gov/pubmed/24068962

                  This report is not valid for clinical or diagnostic use.   Page 142 of 1020
                                24Genetics Health report for Olivia. 356556


Pharmacogenetics

  Warfarin

  Warfarin dosing.                                                Your genetic map

                                                                   VKORC1   rs9923231      CC
 What do your genetics tell us?

                            Patients with the CC genotype may require an
                            increased dose of warfarin as compared to
                            patients with the TC or TT genotype.

 More information:

                  This report is not valid for clinical or diagnostic use.   Page 200 of 1020
                                24Genetics Health report for Olivia. 356556


Hereditary Diseases (genetics)

  Vasculitis due to ADA2 deficiency

  A rare genetic disease.                                          Your genetic map

                                                                   ADA2     rs200930463    CC
 What do your genetics tell us?

                           We have not detected any pathogenic
                           mutations, but, since we only analyse a part of
                           the gene, you could have a pathogenic mutation.

 More information:

                  This report is not valid for clinical or diagnostic use.   Page 1015 of 1020
                                24Genetics Health report for Olivia. 356556
`;

describe("detect24Genetics", () => {
  it("detects a 24Genetics health report", () => {
    expect(detect24Genetics(FIXTURE)).toBe(true);
  });

  it("rejects non-24Genetics text", () => {
    expect(detect24Genetics("# rsid\tchromosome\tposition\tgenotype")).toBe(false);
  });
});

describe("parse24Genetics", () => {
  const report = parse24Genetics(FIXTURE);

  it("reports the 24genetics source", () => {
    expect(report.source).toBe("24genetics");
  });

  it("maps category headers to display categories", () => {
    const cats = new Set(report.findings.map((f) => f.category));
    expect(cats).toContain("Neurology");
    expect(cats).toContain("Circulatory System");
    expect(cats).toContain("Oncogenic Mutations");
    expect(cats).toContain("Complex Diseases");
    expect(cats).toContain("Biomarkers");
    expect(cats).toContain("Pharmacogenetics");
  });

  it("extracts GWAS verdicts and SNPs", () => {
    const pk = report.findings.find((f) => f.condition === "Parkinson's disease");
    expect(pk).toBeDefined();
    expect(pk!.verdict).toBe("reduced");
    expect(pk!.category).toBe("Neurology");
    expect(pk!.snps).toEqual([
      { rsid: "rs35749011", genotype: "GG" },
      { rsid: "rs823118", genotype: "CC" },
    ]);
    expect(pk!.pubmedUrl).toBe("https://www.ncbi.nlm.nih.gov/pubmed/25064009");

    const hl = report.findings.find((f) => f.condition === "Hodgkin's lymphoma");
    expect(hl!.verdict).toBe("elevated");
  });

  it("handles mutation-screening verdicts interleaved with the SNP table", () => {
    const brca = report.findings.find((f) => f.condition.startsWith("BRCA1"));
    expect(brca!.verdict).toBe("clear");
    expect(brca!.category).toBe("Oncogenic Mutations");

    const flagged = report.findings.find((f) => f.verdict === "flagged_pathogenic");
    expect(flagged!.condition).toBe("gastric cancer");
  });

  it("classifies biomarker and pharmacogenetics verdicts", () => {
    const calcium = report.findings.find((f) => f.condition === "Calcium levels");
    expect(calcium!.verdict).toBe("average_biomarker");

    const warfarin = report.findings.find((f) => f.condition === "Warfarin");
    expect(warfarin!.verdict).toBe("drug_abnormal");
  });

  it("skips hereditary 'clear' results as noise", () => {
    const hereditary = report.findings.find(
      (f) => f.category === "Hereditary Diseases",
    );
    expect(hereditary).toBeUndefined();
  });
});
