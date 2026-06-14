import { unzipSync, strFromU8 } from "fflate";
import { ParseError } from "./types";

// Extract the single genome data file from a zip archive (in-browser).
// Picks the largest .txt/.csv/.tsv entry, ignoring metadata/readme files.
export function extractGenomeFromZip(bytes: Uint8Array): string {
  const files = unzipSync(bytes);
  const candidates = Object.entries(files).filter(([name]) => {
    const lower = name.toLowerCase();
    if (lower.includes("__macosx") || lower.endsWith("/")) return false;
    return /\.(txt|csv|tsv)$/.test(lower);
  });

  if (candidates.length === 0) {
    throw new ParseError("No .txt/.csv/.tsv data file found inside the zip.");
  }

  candidates.sort((a, b) => b[1].length - a[1].length);
  return strFromU8(candidates[0][1]);
}
