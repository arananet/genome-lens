import { describe, expect, it } from "vitest";
import { loadKnowledgeBase, validateEntry } from "../src/kb/loader";
import type { KbEntry } from "../src/kb/types";
import { canonicalGenotype, countEffectAllele, reverseComplement } from "../src/kb/strand";

describe("strand utilities", () => {
  it("reverse-complements correctly", () => {
    expect(reverseComplement("A")).toBe("T");
    expect(reverseComplement("AG")).toBe("CT");
    expect(reverseComplement("ATCG")).toBe("CGAT");
  });
  it("counts effect alleles", () => {
    expect(countEffectAllele("AA", "A")).toBe(2);
    expect(countEffectAllele("AG", "A")).toBe(1);
    expect(countEffectAllele("GG", "A")).toBe(0);
    expect(countEffectAllele("--", "A")).toBe(0);
  });
  it("canonicalizes genotype order", () => {
    expect(canonicalGenotype("GA")).toBe("AG");
    expect(canonicalGenotype("--")).toBe("--");
  });
});

describe("knowledge base", () => {
  it("loads and validates every entry", () => {
    const kb = loadKnowledgeBase();
    expect(kb.entries.length).toBeGreaterThan(0);
    kb.entries.forEach((e, i) => expect(() => validateEntry(e, i)).not.toThrow());
  });

  it("includes the required seed SNPs", () => {
    const ids = new Set(loadKnowledgeBase().entries.map((e) => e.rsid));
    for (const rsid of ["rs4680", "rs429358", "rs7412", "rs6025", "rs1800562", "rs1815739", "rs9939609", "rs17782313", "rs1061170", "rs10490924"]) {
      expect(ids.has(rsid)).toBe(true);
    }
  });

  it("rejects an entry with no sources", () => {
    const bad = {
      rsid: "rs1",
      gene: "X",
      category: "trait",
      effectAlleleFwd: "A",
      genotypeInterpretation: { AA: "x" },
      tier: "B",
      sources: [],
      caveats: "c",
    } as unknown as KbEntry;
    expect(() => validateEntry(bad, 0)).toThrow();
  });
});
