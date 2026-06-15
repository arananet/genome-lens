import { forEachLine } from "./lines";
import { buildGenome, normalizeChrom, normalizeGenotype } from "./normalizer";
import { ParseError, type ParsedGenome, type Variant } from "./types";

// Parses a single-sample VCF (v4.x). Extracts SNVs only — indels and
// structural variants are skipped since the KB is SNP-based.
// Supports both "chr1" and "1" chromosome notation.
export function parseVcf(text: string): ParsedGenome {
  const variants: Variant[] = [];
  let headerFound = false;
  let formatColIdx = -1;
  let sampleColIdx = -1;

  forEachLine(text, (line) => {
    if (line.startsWith("##")) return; // meta-info lines

    if (line.startsWith("#CHROM")) {
      headerFound = true;
      // Find FORMAT and first sample column index
      const cols = line.split("\t");
      formatColIdx = cols.indexOf("FORMAT");
      sampleColIdx = formatColIdx >= 0 ? formatColIdx + 1 : -1;
      return;
    }

    if (!headerFound) return;

    const cols = line.split("\t");
    if (cols.length < 8) return;

    // CHROM POS ID REF ALT QUAL FILTER INFO [FORMAT SAMPLE...]
    const rawChrom = cols[0];
    const chrom = normalizeChrom(rawChrom.replace(/^chr/i, ""));
    if (chrom === null) return;

    const pos = parseInt(cols[1], 10);
    if (Number.isNaN(pos)) return;

    // rsid from ID column; fall back to chrom:pos notation
    const idField = cols[2];
    const rsid = idField && idField !== "." ? idField.split(";")[0].trim() : `${chrom}:${pos}`;

    const ref = cols[3].toUpperCase();
    const altField = cols[4];
    if (!altField || altField === "." || altField === "*") return;
    const alts = altField.split(",").map((a) => a.toUpperCase());

    // Skip indels — only keep biallelic SNVs the KB can match
    if (ref.length !== 1) return;

    // Parse GT from FORMAT/SAMPLE
    let genotype = "--";
    if (formatColIdx >= 0 && sampleColIdx >= 0 && cols.length > sampleColIdx) {
      const formatFields = cols[formatColIdx].split(":");
      const gtIdx = formatFields.indexOf("GT");
      if (gtIdx >= 0) {
        const sampleFields = cols[sampleColIdx].split(":");
        const gt = sampleFields[gtIdx] ?? "";
        // Handle phased (|) and unphased (/) genotypes, and no-calls (.)
        const alleleIdxs = gt.split(/[/|]/).map((a) => {
          if (a === "." || a === "") return null;
          return parseInt(a, 10);
        });
        const resolvedAlleles = alleleIdxs.map((idx) => {
          if (idx === null) return null;
          if (idx === 0) return ref.length === 1 ? ref : null;
          const alt = alts[idx - 1];
          return alt && alt.length === 1 ? alt : null; // only SNV alts
        });
        if (resolvedAlleles.length === 2) {
          if (resolvedAlleles.some((a) => a === null)) {
            genotype = "--"; // partial or missing call
          } else {
            genotype = normalizeGenotype((resolvedAlleles as string[]).join(""));
          }
        }
      }
    }

    variants.push({ rsid, chrom, pos, genotype });
  });

  if (!headerFound) {
    throw new ParseError("VCF header line (#CHROM) not found.");
  }
  if (variants.length === 0) {
    throw new ParseError("No SNV records found in VCF. Indels and structural variants are not supported yet.");
  }

  return buildGenome("vcf", variants);
}
