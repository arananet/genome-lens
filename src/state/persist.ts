import type { GenomeSource, ParsedGenome, Variant } from "../parse/types";
import { buildGenome } from "../parse/normalizer";

// Minimal IndexedDB key/value store. Used ONLY when the user opts in to
// "keep in this browser". Nothing is persisted by default.
const DB_NAME = "genome-lens";
const STORE = "kv";
const GENOME_KEY = "genome";
const FLAG_KEY = "persist-enabled";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbSet(key: string, value: unknown): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

async function idbGet<T>(key: string): Promise<T | undefined> {
  const db = await openDb();
  const result = await new Promise<T | undefined>((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(key);
    req.onsuccess = () => resolve(req.result as T | undefined);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return result;
}

// Serializable form of a genome (Maps are flattened to arrays).
interface StoredGenome {
  source: GenomeSource;
  method?: string;
  variants: Variant[];
}

export async function persistGenome(genome: ParsedGenome): Promise<void> {
  const variants = [...genome.byChrom.values()].flat();
  const stored: StoredGenome = { source: genome.source, method: genome.method, variants };
  await idbSet(GENOME_KEY, stored);
  await idbSet(FLAG_KEY, true);
}

export async function loadPersistedGenome(): Promise<ParsedGenome | null> {
  const flag = await idbGet<boolean>(FLAG_KEY);
  if (!flag) return null;
  const stored = await idbGet<StoredGenome>(GENOME_KEY);
  if (!stored) return null;
  return buildGenome(stored.source, stored.variants, stored.method);
}

export async function wipePersisted(): Promise<void> {
  try {
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.deleteDatabase(DB_NAME);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
      req.onblocked = () => resolve();
    });
  } catch {
    // best-effort wipe
  }
}

export async function isPersistEnabled(): Promise<boolean> {
  return (await idbGet<boolean>(FLAG_KEY)) === true;
}
