import { detectFormat } from "./detect";
import { parse23andme } from "./parse23andme";
import { parseAncestry } from "./parseAncestry";
import { parseMyHeritage } from "./parseMyHeritage";
import { extractGenomeFromZip } from "./zip";
import { ParseError, type ParsedGenome } from "./types";

export { detectFormat } from "./detect";
export { ParseError } from "./types";
export type { ParsedGenome, Variant, GenomeSource, Genotype } from "./types";

// Parse already-extracted text by auto-detecting the vendor format.
export function parseGenomeText(text: string): ParsedGenome {
  const source = detectFormat(text);
  switch (source) {
    case "23andme":
      return parse23andme(text);
    case "ancestry":
      return parseAncestry(text);
    case "myheritage":
      return parseMyHeritage(text);
    default:
      throw new ParseError(
        "Unrecognized file format. Supported: 23andMe, AncestryDNA, MyHeritage raw exports.",
      );
  }
}

// Read a Blob as text, preferring Blob.text() but falling back to FileReader
// for environments (e.g. jsdom) that don't implement it.
function readText(file: Blob): Promise<string> {
  if (typeof file.text === "function") return file.text();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

function readArrayBuffer(file: Blob): Promise<ArrayBuffer> {
  if (typeof file.arrayBuffer === "function") return file.arrayBuffer();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(file);
  });
}

// Parse a user-selected File: unzips .zip in-browser, otherwise reads as text.
export async function parseGenomeFile(file: File): Promise<ParsedGenome> {
  const isZip = file.name.toLowerCase().endsWith(".zip");
  if (isZip) {
    const buf = new Uint8Array(await readArrayBuffer(file));
    const text = extractGenomeFromZip(buf);
    return parseGenomeText(text);
  }
  const text = await readText(file);
  return parseGenomeText(text);
}
