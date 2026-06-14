import { describe, expect, it } from "vitest";
import { parseGenomeText } from "../src/parse";
import { matchGenome } from "../src/analysis/match";
import {
  FIXTURE_23ANDME,
  FIXTURE_23ANDME_NO_APOE_KEY,
  FIXTURE_MYHERITAGE,
} from "./fixtures";

function find(findings: ReturnType<typeof matchGenome>, rsid: string) {
  return findings.find((f) => f.entry.rsid === rsid)!;
}

describe("matchGenome", () => {
  it("reports only present rsids as covered and interprets genotype", () => {
    const findings = matchGenome(parseGenomeText(FIXTURE_23ANDME));
    const comt = find(findings, "rs4680");
    expect(comt.covered).toBe(true);
    expect(comt.genotype).toBe("AG");
    expect(comt.copies).toBe(1);
    expect(comt.interpretation.toLowerCase()).toContain("met");
  });

  it("marks absent seed SNPs as not covered (not a negative result)", () => {
    const findings = matchGenome(parseGenomeText(FIXTURE_23ANDME));
    const mc4r = find(findings, "rs17782313");
    expect(mc4r.covered).toBe(false);
    expect(mc4r.interpretation.toLowerCase()).toContain("not covered");
  });

  it("flags APOE as indeterminate when rs429358 is missing", () => {
    const findings = matchGenome(parseGenomeText(FIXTURE_23ANDME_NO_APOE_KEY));
    const apoe2 = find(findings, "rs7412");
    expect(apoe2.covered).toBe(true);
    expect(apoe2.indeterminate).toBe(true);
    expect(apoe2.interpretation.toLowerCase()).toContain("indeterminate");
  });

  it("flags low-confidence on low-pass method and no-calls", () => {
    const findings = matchGenome(parseGenomeText(FIXTURE_MYHERITAGE));
    const armit = find(findings, "rs10490924");
    expect(armit.noCall).toBe(true);
    expect(armit.lowConfidence).toBe(true);
    // Even non-no-call variants are low-confidence under low-pass WGS.
    const cfh = find(findings, "rs1061170");
    expect(cfh.lowConfidence).toBe(true);
  });
});
