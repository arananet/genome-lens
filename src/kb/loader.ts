import raw from "./knowledge-base.json";
import type { KbCategory, KbEntry, Tier } from "./types";

const CATEGORIES: KbCategory[] = [
  "pharmacogenomic",
  "disease-risk",
  "trait",
  "fitness",
  "body-composition",
  "vision",
];
const TIERS: Tier[] = ["A", "B", "C"];

export interface KnowledgeBase {
  version: string;
  build: string;
  orientation: string;
  entries: KbEntry[];
}

// Validate a single entry shape. Throws on the first structural problem so a
// malformed KB fails loudly in tests/CI rather than shipping silently.
export function validateEntry(e: KbEntry, index: number): void {
  const where = `KB entry #${index} (${e?.rsid ?? "?"})`;
  if (!e.rsid || !/^rs\d+$/i.test(e.rsid)) throw new Error(`${where}: invalid rsid`);
  if (!e.gene) throw new Error(`${where}: missing gene`);
  if (!CATEGORIES.includes(e.category)) throw new Error(`${where}: invalid category '${e.category}'`);
  if (!e.effectAlleleFwd || !/^[ACGT]+$/i.test(e.effectAlleleFwd)) {
    throw new Error(`${where}: invalid effectAlleleFwd`);
  }
  if (!e.genotypeInterpretation || Object.keys(e.genotypeInterpretation).length === 0) {
    throw new Error(`${where}: empty genotypeInterpretation`);
  }
  if (!TIERS.includes(e.tier)) throw new Error(`${where}: invalid tier '${e.tier}'`);
  if (!Array.isArray(e.sources) || e.sources.length < 1) {
    throw new Error(`${where}: at least one source required`);
  }
  for (const s of e.sources) {
    if (!s.db || !s.id || !s.url) throw new Error(`${where}: incomplete source`);
  }
  if (!e.caveats || e.caveats.trim().length === 0) throw new Error(`${where}: caveats are mandatory`);
}

let cached: KnowledgeBase | null = null;

export function loadKnowledgeBase(): KnowledgeBase {
  if (cached) return cached;
  const kb = raw as unknown as KnowledgeBase;
  kb.entries.forEach((e, i) => validateEntry(e, i));
  cached = kb;
  return kb;
}

export function kbByRsid(): Map<string, KbEntry> {
  const map = new Map<string, KbEntry>();
  for (const e of loadKnowledgeBase().entries) map.set(e.rsid, e);
  return map;
}
