// Persistent-storage layer for the Railway deployment.
// Set GENOME_LENS_DATA_DIR=/data (Railway volume mount) to opt in.
// Falls back to <repo>/data for local development.
import {
  existsSync,
  mkdirSync,
  readdirSync,
  copyFileSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Factory ───────────────────────────────────────────────────────────────────
// createStorage(dataDir) returns all storage helpers bound to a specific root.
// Tests call this directly with a temp directory. server.mjs uses the default
// instance (exported below) which reads GENOME_LENS_DATA_DIR from env.

export function createStorage(dataDir) {
  const WIKI_DIR    = join(dataDir, "wiki");
  const CACHE_DIR   = join(dataDir, "cache");
  const RESULTS_DIR = join(dataDir, "results");

  const SUBDIRS = [
    join(WIKI_DIR, "glossary"),
    join(WIKI_DIR, "memory"),
    join(CACHE_DIR, "synth"),
    RESULTS_DIR,
  ];

  function ensureDataDirs() {
    for (const dir of SUBDIRS) mkdirSync(dir, { recursive: true });
    console.log(`[storage] data root: ${dataDir}`);
  }

  // Copy bundled wiki pages to the volume on first boot.
  // Existing files are never overwritten so custom edits survive redeploys.
  function seedWiki() {
    const srcWiki = join(__dirname, "wiki");
    if (!existsSync(srcWiki)) return;
    for (const area of ["glossary", "memory"]) {
      const srcDir = join(srcWiki, area);
      const dstDir = join(WIKI_DIR, area);
      if (!existsSync(srcDir)) continue;
      let seeded = 0;
      for (const file of readdirSync(srcDir)) {
        const dst = join(dstDir, file);
        if (!existsSync(dst)) {
          copyFileSync(join(srcDir, file), dst);
          seeded++;
        }
      }
      if (seeded > 0) console.log(`[storage] seeded ${seeded} file(s) → wiki/${area}/`);
    }
  }

  // Synthesis cache ---------------------------------------------------------

  function synthCacheKey(body) {
    return createHash("sha256").update(JSON.stringify(body)).digest("hex").slice(0, 16);
  }

  function readSynthCache(key) {
    const path = join(CACHE_DIR, "synth", `${key}.json`);
    if (!existsSync(path)) return null;
    try {
      return JSON.parse(readFileSync(path, "utf8"));
    } catch {
      return null;
    }
  }

  function writeSynthCache(key, entry) {
    writeFileSync(join(CACHE_DIR, "synth", `${key}.json`), JSON.stringify(entry, null, 2));
  }

  // Results list ------------------------------------------------------------

  function listResults(limit = 50) {
    const dir = join(CACHE_DIR, "synth");
    if (!existsSync(dir)) return [];
    return readdirSync(dir)
      .filter((f) => f.endsWith(".json"))
      .sort()
      .reverse()
      .slice(0, limit)
      .flatMap((f) => {
        try {
          return [JSON.parse(readFileSync(join(dir, f), "utf8"))];
        } catch {
          return [];
        }
      });
  }

  // Oracle decision log -----------------------------------------------------

  function readOracleLog(limit = 50) {
    const path = join(WIKI_DIR, "memory", "decisions.md");
    if (!existsSync(path)) return [];
    return readFileSync(path, "utf8")
      .split("\n")
      .filter((l) => l.startsWith("- "))
      .slice(-limit)
      .reverse();
  }

  // Wiki glossary -----------------------------------------------------------

  function parseFrontMatter(raw) {
    const match = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(raw);
    if (!match) return { meta: {}, body: raw };
    const meta = {};
    for (const line of match[1].split("\n")) {
      const kv = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line.trim());
      if (kv) meta[kv[1]] = kv[2].replace(/^["']|["']$/g, "");
    }
    return { meta, body: match[2].trim() };
  }

  function listGlossary() {
    const dir = join(WIKI_DIR, "glossary");
    if (!existsSync(dir)) return [];
    return readdirSync(dir)
      .filter((f) => f.endsWith(".md"))
      .map((f) => {
        const slug = f.replace(/\.md$/, "");
        try {
          const { meta } = parseFrontMatter(readFileSync(join(dir, f), "utf8"));
          return { slug, title: meta.title ?? meta.term ?? slug };
        } catch {
          return { slug, title: slug };
        }
      })
      .sort((a, b) => a.title.localeCompare(b.title));
  }

  function readGlossaryPage(slug) {
    const path = join(WIKI_DIR, "glossary", `${slug}.md`);
    if (!existsSync(path)) return null;
    const { meta, body } = parseFrontMatter(readFileSync(path, "utf8"));
    return { slug, meta, body };
  }

  return {
    dataDir, WIKI_DIR, CACHE_DIR, RESULTS_DIR,
    ensureDataDirs, seedWiki,
    synthCacheKey, readSynthCache, writeSynthCache,
    listResults, readOracleLog,
    listGlossary, readGlossaryPage,
  };
}

// ── Default instance (used by server.mjs) ────────────────────────────────────

const DATA_DIR = process.env.GENOME_LENS_DATA_DIR ?? join(__dirname, "data");
const _default = createStorage(DATA_DIR);

export const { WIKI_DIR, CACHE_DIR, RESULTS_DIR } = _default;
export const { ensureDataDirs, seedWiki } = _default;
export const { synthCacheKey, readSynthCache, writeSynthCache } = _default;
export const { listResults, readOracleLog } = _default;
export const { listGlossary, readGlossaryPage } = _default;
export { DATA_DIR };
