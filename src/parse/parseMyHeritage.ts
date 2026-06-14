import { forEachLine } from "./lines";
import { buildGenome, normalizeChrom, normalizeGenotype } from "./normalizer";
import { ParseError, type ParsedGenome, type Variant } from "./types";

// Split a CSV line into fields, honoring double-quoted fields and "" escapes.
function splitCsv(line: string): string[] {
  const out: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      out.push(field);
      field = "";
    } else {
      field += ch;
    }
  }
  out.push(field);
  return out;
}

// MyHeritage raw export: CSV, '##'-prefixed metadata headers, quoted fields,
// columns: RSID,CHROMOSOME,POSITION,RESULT. Genotype is forward-strand vs build37.
// A "##method=Low-pass Whole Genome Sequencing" line drives confidence flagging.
export function parseMyHeritage(text: string): ParsedGenome {
  const variants: Variant[] = [];
  let method: string | undefined;
  let headerSeen = false;

  forEachLine(text, (line) => {
    if (line.length === 0) return;
    if (line.startsWith("#")) {
      const m = /method\s*=\s*(.+)$/i.exec(line);
      if (m) method = m[1].trim().replace(/^"|"$/g, "");
      return;
    }
    const cols = splitCsv(line).map((c) => c.trim());
    if (cols.length < 4) return;
    if (!headerSeen && cols[0].toLowerCase() === "rsid") {
      headerSeen = true;
      return;
    }
    const chrom = normalizeChrom(cols[1]);
    const pos = parseInt(cols[2], 10);
    if (chrom === null || Number.isNaN(pos)) return;
    variants.push({
      rsid: cols[0],
      chrom,
      pos,
      genotype: normalizeGenotype(cols[3]),
    });
  });

  if (variants.length === 0) {
    throw new ParseError("No MyHeritage variant rows found.");
  }
  return buildGenome("myheritage", variants, method);
}
