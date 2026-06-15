import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { existsSync } from "node:fs";

// Import the factory directly — no env-var manipulation needed.
// @ts-expect-error — storage.mjs is a plain ESM file with no TS types
import { createStorage } from "../storage.mjs";

function makeTmpDir() {
  return mkdtempSync(join(tmpdir(), "genome-lens-storage-"));
}

describe("storage: ensureDataDirs", () => {
  let tmp: string;
  beforeEach(() => { tmp = makeTmpDir(); });
  afterEach(() => { rmSync(tmp, { recursive: true, force: true }); });

  it("creates all required subdirectories", () => {
    const s = createStorage(tmp);
    s.ensureDataDirs();
    for (const sub of ["wiki/glossary", "wiki/memory", "cache/synth", "results"]) {
      expect(existsSync(join(tmp, sub)), `${sub} should exist`).toBe(true);
    }
  });
});

describe("storage: seedWiki", () => {
  let tmp: string;
  beforeEach(() => { tmp = makeTmpDir(); });
  afterEach(() => { rmSync(tmp, { recursive: true, force: true }); });

  it("copies repo glossary pages to the volume", () => {
    const s = createStorage(tmp);
    s.ensureDataDirs();
    s.seedWiki();
    const files = readdirSync(join(tmp, "wiki", "glossary"));
    expect(files.length).toBeGreaterThan(0);
    expect(files.every((f: string) => f.endsWith(".md"))).toBe(true);
  });

  it("does not overwrite existing files on a second call", () => {
    const s = createStorage(tmp);
    s.ensureDataDirs();
    s.seedWiki();
    const dir = join(tmp, "wiki", "glossary");
    const first = readdirSync(dir)[0];
    const target = join(dir, first);
    writeFileSync(target, "CUSTOM");
    s.seedWiki();
    expect(readFileSync(target, "utf8")).toBe("CUSTOM");
  });
});

describe("storage: synthCacheKey", () => {
  const s = createStorage("/irrelevant");

  it("returns a 16-char hex string", () => {
    expect(s.synthCacheKey({ totals: { parsed: 5 }, breakdown: {} })).toMatch(/^[0-9a-f]{16}$/);
  });

  it("is stable for the same input", () => {
    const body = { totals: { parsed: 100 }, breakdown: { health: { A: 1, B: 2, C: 0 } } };
    expect(s.synthCacheKey(body)).toBe(s.synthCacheKey(body));
  });

  it("differs for different input", () => {
    expect(s.synthCacheKey({ x: 1 })).not.toBe(s.synthCacheKey({ x: 2 }));
  });
});

describe("storage: readSynthCache / writeSynthCache", () => {
  let tmp: string;
  let s: ReturnType<typeof createStorage>;
  beforeEach(() => {
    tmp = makeTmpDir();
    s = createStorage(tmp);
    s.ensureDataDirs();
  });
  afterEach(() => { rmSync(tmp, { recursive: true, force: true }); });

  it("returns null on a cache miss", () => {
    expect(s.readSynthCache("doesnotexist")).toBeNull();
  });

  it("round-trips a cache entry", () => {
    const entry = { key: "abc123", synthesis: "Hello world", createdAt: "2026-01-01" };
    s.writeSynthCache("abc123", entry);
    expect(s.readSynthCache("abc123")).toEqual(entry);
  });
});
