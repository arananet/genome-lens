import { describe, expect, it } from "vitest";
import { zipSync, strToU8 } from "fflate";
import { detectFormat } from "../src/parse/detect";
import { parseGenomeText, parseGenomeFile, ParseError } from "../src/parse";
import { normalizeChrom, normalizeGenotype } from "../src/parse/normalizer";
import {
  FIXTURE_23ANDME,
  FIXTURE_ANCESTRY,
  FIXTURE_MYHERITAGE,
  FIXTURE_UNKNOWN,
} from "./fixtures";

describe("detectFormat", () => {
  it("detects each vendor and rejects unknown", () => {
    expect(detectFormat(FIXTURE_23ANDME)).toBe("23andme");
    expect(detectFormat(FIXTURE_ANCESTRY)).toBe("ancestry");
    expect(detectFormat(FIXTURE_MYHERITAGE)).toBe("myheritage");
    expect(detectFormat(FIXTURE_UNKNOWN)).toBe("unknown");
  });
});

describe("normalizer helpers", () => {
  it("normalizes chromosomes", () => {
    expect(normalizeChrom("chr1")).toBe("1");
    expect(normalizeChrom("23")).toBe("X");
    expect(normalizeChrom("25")).toBe("MT");
    expect(normalizeChrom("M")).toBe("MT");
    expect(normalizeChrom("99")).toBeNull();
  });
  it("maps no-call markers to --", () => {
    expect(normalizeGenotype("--")).toBe("--");
    expect(normalizeGenotype("00")).toBe("--");
    expect(normalizeGenotype("ag")).toBe("AG");
  });
});

describe("23andMe parser", () => {
  it("parses rows into the normalized schema", () => {
    const g = parseGenomeText(FIXTURE_23ANDME);
    expect(g.source).toBe("23andme");
    expect(g.build).toBe("GRCh37");
    expect(g.variantCount).toBe(6);
    expect(g.byRsid.get("rs4680")?.genotype).toBe("AG");
    expect(g.byRsid.get("rs429358")?.chrom).toBe("19");
  });
});

describe("AncestryDNA parser", () => {
  it("joins allele1 + allele2 into a single genotype", () => {
    const g = parseGenomeText(FIXTURE_ANCESTRY);
    expect(g.source).toBe("ancestry");
    expect(g.byRsid.get("rs4680")?.genotype).toBe("AG");
    expect(g.byRsid.get("rs1800562")?.genotype).toBe("GA");
  });
});

describe("MyHeritage parser", () => {
  it("parses quoted CSV, preserves no-calls, detects low-pass method", () => {
    const g = parseGenomeText(FIXTURE_MYHERITAGE);
    expect(g.source).toBe("myheritage");
    expect(g.method).toMatch(/low-pass/i);
    expect(g.byRsid.get("rs4680")?.genotype).toBe("AG");
    expect(g.byRsid.get("rs10490924")?.genotype).toBe("--");
  });
});

describe("normalizer indexing", () => {
  it("sorts byChrom by position", () => {
    const g = parseGenomeText(FIXTURE_23ANDME);
    const chr19 = g.byChrom.get("19")!;
    expect(chr19.map((v) => v.pos)).toEqual([...chr19.map((v) => v.pos)].sort((a, b) => a - b));
  });
});

describe("rejection", () => {
  it("throws ParseError on unrecognized files", () => {
    expect(() => parseGenomeText(FIXTURE_UNKNOWN)).toThrow(ParseError);
  });
});

describe("zip extraction", () => {
  it("extracts and parses a zipped genome file", async () => {
    const zipped = zipSync({ "genome.txt": strToU8(FIXTURE_23ANDME) });
    const file = new File([zipped], "genome.zip", { type: "application/zip" });
    const g = await parseGenomeFile(file);
    expect(g.source).toBe("23andme");
    expect(g.variantCount).toBe(6);
  });
});
