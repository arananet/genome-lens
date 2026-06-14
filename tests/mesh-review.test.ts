import { describe, expect, it } from "vitest";
import { parseGenomeFile } from "../src/parse";
import { matchGenome } from "../src/analysis/match";
import { reviewAllFindings, buildMeshSummary } from "../src/analysis/mesh-review";
import type { Finding } from "../src/analysis/types";
import { FIXTURE_23ANDME } from "./fixtures";

function fileFrom(text: string): File {
  return new File([text], "test.txt", { type: "text/plain" });
}

describe("mesh-review: reviewAllFindings", () => {
  it("all standard KB interpretations pass Oracle (no diagnostic phrasing in KB)", async () => {
    const genome = await parseGenomeFile(fileFrom(FIXTURE_23ANDME));
    const findings = matchGenome(genome);
    const verdicts = reviewAllFindings(findings);
    const flagged = verdicts.filter((v) => v.verdict !== "allow");
    expect(flagged).toHaveLength(0);
  });

  it("flags a finding whose interpretation contains a risk percentage", () => {
    const fakeFindings: Finding[] = [
      {
        entry: {
          rsid: "rs0000",
          gene: "FAKE",
          category: "disease-risk",
          effectAlleleFwd: "A",
          genotypeInterpretation: {},
          tier: "B",
          sources: [{ db: "dbSNP", id: "rs0000", url: "https://x" }],
          caveats: "none",
        },
        variant: { rsid: "rs0000", chrom: "1", pos: 1, genotype: "AA" },
        genotype: "AA",
        copies: 2,
        interpretation: "You have a 80% risk of developing this condition.",
        covered: true,
        noCall: false,
        lowConfidence: false,
        indeterminate: false,
      },
    ];
    const [verdict] = reviewAllFindings(fakeFindings);
    expect(verdict.verdict).toBe("revise");
  });
});

describe("mesh-review: buildMeshSummary", () => {
  it("counts covered and uncovered correctly", async () => {
    const genome = await parseGenomeFile(fileFrom(FIXTURE_23ANDME));
    const findings = matchGenome(genome);
    const verdicts = reviewAllFindings(findings);
    const summary = buildMeshSummary(genome.variantCount, findings, verdicts);
    expect(summary.parsedCount).toBe(genome.variantCount);
    expect(summary.matchedCount).toBe(findings.length);
    expect(summary.coveredCount).toBeLessThanOrEqual(summary.matchedCount);
    expect(summary.coveredCount).toBeGreaterThan(0);
    expect(summary.flaggedCount).toBe(0);
  });
});
