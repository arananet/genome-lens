import { useRef } from "react";
import { create } from "zustand";
import { matchGenome } from "../analysis/match";
import type { Finding } from "../analysis/types";
import { parseGenomeFile, parseGenomeText, readText } from "../parse";
import { ParseError, type ParsedGenome } from "../parse/types";
import {
  detectHealthReport,
  parseHealthReport,
  type ParsedHealthReport,
} from "../parse/parseHealthReport";
import { wipePersisted } from "./persist";

export type View = "upload" | "trace" | "karyotype" | "reports" | "search" | "wiki";

// Events streamed from the real server-side agent mesh pipeline
export type MeshEvent =
  | { type: "agent-start"; agent: string; summary: string }
  | { type: "tool-call"; agent: string; tool: string; input: Record<string, string> }
  | { type: "tool-result"; agent: string; tool: string; result: unknown }
  | { type: "oracle-ruling"; rsid?: string; agent?: string; verdict: string; reason?: string; invariant?: string }
  | { type: "agent-done"; agent: string; summary: string }
  | { type: "agent-text"; agent: string; text: string }
  | { type: "pipeline-done"; enrichments: Record<string, VariantEnrichment>; geneData: Record<string, GeneEnrichment>; oracleResults: OracleResult[]; stats: MeshStats }
  | { type: "pipeline-blocked"; reason: string }
  | { type: "error"; message: string };

export interface VariantEnrichment {
  rsid: string;
  clinvarSignificance: string | null;
  gnomadAf: number | null;
  pharmgkbId: string | null;
  geneSymbol: string | null;
  curatorNote?: string;
}

export interface GeneEnrichment {
  symbol: string;
  name: string | null;
  summary: string | null;
}

export interface OracleResult {
  rsid: string;
  verdict: string;
  reason?: string;
}

export interface MeshStats {
  enriched: number;
  allowed: number;
  denied: number;
  toolCalls: number;
}

export interface ClinvarHit {
  rsid: string;
  gene: string | null;
  significance: string;
  condition: string | null;
  clinvarId: number | null;
}

export type ClinvarScanEvent =
  | { type: "clinvar-scan-start"; total: number }
  | { type: "clinvar-batch-progress"; scanned: number; total: number; hits: number }
  | { type: "clinvar-hit"; rsid: string; gene: string | null; significance: string; condition: string | null; clinvarId: number | null }
  | { type: "clinvar-scan-done"; scanned: number; total: number; hits: number }
  | { type: "clinvar-scan-error"; message: string };

interface GenomeState {
  genome: ParsedGenome | null;
  findings: Finding[];
  fileName: string | null;
  status: "idle" | "parsing" | "ready" | "error";
  error: string | null;
  parseMs: number;
  matchMs: number;
  sessionStart: number;

  healthReport: ParsedHealthReport | null;

  // Real agent mesh state
  meshEvents: MeshEvent[];
  meshStatus: "idle" | "running" | "done" | "error";
  meshEnrichments: Record<string, VariantEnrichment>;
  meshGeneData: Record<string, GeneEnrichment>;

  // Full-genome ClinVar pathogenic scan
  clinvarHits: ClinvarHit[];
  clinvarScanStatus: "idle" | "running" | "done" | "error";
  clinvarScanProgress: { scanned: number; total: number } | null;

  view: View;
  selectedRsid: string | null;

  noticeAcknowledged: boolean;

  loadFile: (file: File) => Promise<void>;
  setView: (view: View) => void;
  selectVariant: (rsid: string | null) => void;
  acknowledgeNotice: () => void;
  wipeAll: () => Promise<void>;
}

type MeshSummary = { rsid: string; gene: string; category: string; tier: string };

// Low-level SSE fetch to /api/mesh-analyze. Accepts pre-formatted summaries.
async function sendToMeshAnalyze(
  summaries: MeshSummary[],
  onEvent: (e: MeshEvent) => void,
  onEnrichment: (enrichments: Record<string, VariantEnrichment>, geneData: Record<string, GeneEnrichment>) => void,
): Promise<void> {
  if (!summaries.length) return;

  let response: Response;
  try {
    response = await fetch("/api/mesh-analyze", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ findings: summaries }),
    });
  } catch {
    onEvent({ type: "error", message: "Could not reach the agent mesh server." });
    return;
  }

  if (!response.ok || !response.body) {
    onEvent({ type: "error", message: `Agent mesh server responded with ${response.status}` });
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      try {
        const event = JSON.parse(line.slice(6)) as MeshEvent;
        onEvent(event);
        if (event.type === "pipeline-done") {
          onEnrichment(event.enrichments, event.geneData);
        }
      } catch {
        // malformed SSE line — skip
      }
    }
  }
}

// First mesh pass: curated KB findings + a spread sample of genome rsids.
// Fills the 500-slot budget so the MCP tools scan a representative cross-section
// of the full genome even when the curated KB only covers a handful of entries.
async function streamMeshAnalysis(
  findings: Finding[],
  allGenomeRsids: string[], // every rsid from the uploaded genome
  onEvent: (e: MeshEvent) => void,
  onEnrichment: (enrichments: Record<string, VariantEnrichment>, geneData: Record<string, GeneEnrichment>) => void,
): Promise<void> {
  const BUDGET = 500;

  // Tier-sorted KB hits first
  const kbSummaries = findings
    .filter((f) => f.covered)
    .sort((a, b) => (a.entry.tier < b.entry.tier ? -1 : 1))
    .map((f) => ({ rsid: f.entry.rsid, gene: f.entry.gene, category: f.entry.category, tier: f.entry.tier }));

  const kbRsidSet = new Set(kbSummaries.map((s) => s.rsid));

  // Fill remaining budget with evenly-spaced rsids from the full genome.
  // Systematic stride (every Nth) avoids a costly random-shuffle of 600K items
  // while still giving a spread across the genome file.
  const remaining = BUDGET - kbSummaries.length;
  const pool = allGenomeRsids.filter((id) => /^rs\d+$/.test(id) && !kbRsidSet.has(id));
  const stride = pool.length > 0 ? Math.max(1, Math.floor(pool.length / remaining)) : 1;
  const genomeSample: MeshSummary[] = [];
  for (let i = 0; i < pool.length && genomeSample.length < remaining; i += stride) {
    genomeSample.push({ rsid: pool[i], gene: "", category: "trait", tier: "C" });
  }

  const summaries = [...kbSummaries, ...genomeSample];
  await sendToMeshAnalyze(summaries, onEvent, onEnrichment);
}

// Stream /api/clinvar-scan SSE — sends all rsids from the uploaded genome, receives
// only Pathogenic / Likely pathogenic ClinVar hits. Called fire-and-forget after parse.
async function streamClinvarScan(
  rsids: string[],
  onEvent: (e: ClinvarScanEvent) => void,
): Promise<void> {
  let response: Response;
  try {
    response = await fetch("/api/clinvar-scan", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ rsids }),
    });
  } catch {
    onEvent({ type: "clinvar-scan-error", message: "Could not reach the ClinVar scan server." });
    return;
  }

  if (!response.ok || !response.body) {
    onEvent({ type: "clinvar-scan-error", message: `ClinVar scan responded with ${response.status}` });
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      try {
        const event = JSON.parse(line.slice(6)) as ClinvarScanEvent;
        onEvent(event);
      } catch {
        // malformed SSE line — skip
      }
    }
  }
}

// Packages the common mesh-event callbacks so they can be reused across pipeline passes.
function makeMeshCallbacks(set: (partial: Partial<GenomeState> | ((s: GenomeState) => Partial<GenomeState>)) => void) {
  return {
    onEvent(event: MeshEvent) {
      set((state) => {
        const isDone = event.type === "pipeline-done";
        const isError = event.type === "error" || event.type === "pipeline-blocked";
        return {
          meshEvents: [...state.meshEvents, event],
          meshStatus: isDone ? "done" : isError ? "error" : "running",
        };
      });
    },
    onEnrichment(enrichments: Record<string, VariantEnrichment>, geneData: Record<string, GeneEnrichment>) {
      set((state) => ({
        meshEnrichments: { ...state.meshEnrichments, ...enrichments },
        meshGeneData: { ...state.meshGeneData, ...geneData },
      }));
    },
  };
}

export const useGenomeStore = create<GenomeState>((set) => ({
  genome: null,
  findings: [],
  fileName: null,
  status: "idle",
  error: null,
  parseMs: 0,
  matchMs: 0,
  sessionStart: 0,

  healthReport: null,

  meshEvents: [],
  meshStatus: "idle",
  meshEnrichments: {},
  meshGeneData: {},

  clinvarHits: [],
  clinvarScanStatus: "idle",
  clinvarScanProgress: null,

  view: "upload",
  selectedRsid: null,

  noticeAcknowledged: false,

  async loadFile(file) {
    set({
      status: "parsing",
      error: null,
      fileName: file.name,
      healthReport: null,
      meshEvents: [],
      meshStatus: "idle",
      meshEnrichments: {},
      meshGeneData: {},
      clinvarHits: [],
      clinvarScanStatus: "idle",
      clinvarScanProgress: null,
    });
    try {
      const isZip = file.name.toLowerCase().endsWith(".zip");

      if (!isZip) {
        const text = await readText(file);

        // Detect GWAS health report format before the raw-genome pipeline
        if (detectHealthReport(text)) {
          const report = parseHealthReport(text);
          set({
            healthReport: report,
            genome: null,
            findings: [],
            status: "ready",
            error: null,
            parseMs: 0,
            matchMs: 0,
            sessionStart: Date.now(),
            view: "reports",
          });
          return;
        }

        // Standard raw-genome text pipeline
        const sessionStart = Date.now();
        const t0 = performance.now();
        const genome = parseGenomeText(text);
        const parseMs = Math.round(performance.now() - t0);
        const t1 = performance.now();
        const findings = matchGenome(genome);
        const matchMs = Math.round(performance.now() - t1);
        set({ genome, findings, status: "ready", error: null, parseMs, matchMs, sessionStart, view: "trace" });

        // First mesh pass: enrich curated KB findings (non-blocking — UI is already usable)
        set({ meshStatus: "running" });
        const meshCbs1 = makeMeshCallbacks(set);
        const allRsids1 = [...genome.byRsid.keys()];
        streamMeshAnalysis(findings, allRsids1, meshCbs1.onEvent, meshCbs1.onEnrichment).catch((err: Error) => {
          meshCbs1.onEvent({ type: "error", message: err.message });
        });

        // Full-genome ClinVar pathogenic scan — sends all rsids (no genotypes)
        const allRsids = [...genome.byRsid.keys()].filter((id) => /^rs\d+$/.test(id));
        set({ clinvarScanStatus: "running" });
        const collectedHits: ClinvarHit[] = [];
        const meshCbs = makeMeshCallbacks(set);
        streamClinvarScan(allRsids, (event) => {
          if (event.type === "clinvar-scan-start") {
            set({ clinvarScanProgress: { scanned: 0, total: event.total } });
          } else if (event.type === "clinvar-batch-progress") {
            set({ clinvarScanProgress: { scanned: event.scanned, total: event.total } });
          } else if (event.type === "clinvar-hit") {
            const hit: ClinvarHit = { rsid: event.rsid, gene: event.gene, significance: event.significance, condition: event.condition, clinvarId: event.clinvarId };
            collectedHits.push(hit);
            set((state) => ({ clinvarHits: [...state.clinvarHits, hit] }));
          } else if (event.type === "clinvar-scan-done") {
            set({ clinvarScanStatus: "done" });
            if (collectedHits.length > 0) {
              // Second mesh pass: enrich the real pathogenic hits from the full-genome scan
              const hitSummaries = collectedHits.slice(0, 500).map((h) => ({
                rsid: h.rsid, gene: h.gene ?? "", category: "disease-risk", tier: "A",
              }));
              set({ meshStatus: "running" });
              sendToMeshAnalyze(hitSummaries, meshCbs.onEvent, meshCbs.onEnrichment).catch((err: Error) => {
                meshCbs.onEvent({ type: "error", message: err.message });
              });
            }
          } else if (event.type === "clinvar-scan-error") {
            set({ clinvarScanStatus: "error" });
          }
        }).catch(() => {
          set({ clinvarScanStatus: "error" });
        });
      } else {
        // Zip path — delegates to parseGenomeFile which handles unzipping
        const sessionStart = Date.now();
        const t0 = performance.now();
        const genome = await parseGenomeFile(file);
        const parseMs = Math.round(performance.now() - t0);
        const t1 = performance.now();
        const findings = matchGenome(genome);
        const matchMs = Math.round(performance.now() - t1);
        set({ genome, findings, status: "ready", error: null, parseMs, matchMs, sessionStart, view: "trace" });

        // First mesh pass: enrich curated KB findings (zip path)
        set({ meshStatus: "running" });
        const meshCbs1Zip = makeMeshCallbacks(set);
        const allRsids1Zip = [...genome.byRsid.keys()];
        streamMeshAnalysis(findings, allRsids1Zip, meshCbs1Zip.onEvent, meshCbs1Zip.onEnrichment).catch((err: Error) => {
          meshCbs1Zip.onEvent({ type: "error", message: err.message });
        });

        // Full-genome ClinVar pathogenic scan (zip path)
        const allRsidsZip = [...genome.byRsid.keys()].filter((id) => /^rs\d+$/.test(id));
        set({ clinvarScanStatus: "running" });
        const collectedHitsZip: ClinvarHit[] = [];
        const meshCbsZip = makeMeshCallbacks(set);
        streamClinvarScan(allRsidsZip, (event) => {
          if (event.type === "clinvar-scan-start") {
            set({ clinvarScanProgress: { scanned: 0, total: event.total } });
          } else if (event.type === "clinvar-batch-progress") {
            set({ clinvarScanProgress: { scanned: event.scanned, total: event.total } });
          } else if (event.type === "clinvar-hit") {
            const hit: ClinvarHit = { rsid: event.rsid, gene: event.gene, significance: event.significance, condition: event.condition, clinvarId: event.clinvarId };
            collectedHitsZip.push(hit);
            set((state) => ({ clinvarHits: [...state.clinvarHits, hit] }));
          } else if (event.type === "clinvar-scan-done") {
            set({ clinvarScanStatus: "done" });
            if (collectedHitsZip.length > 0) {
              const hitSummaries = collectedHitsZip.slice(0, 500).map((h) => ({
                rsid: h.rsid, gene: h.gene ?? "", category: "disease-risk", tier: "A",
              }));
              set({ meshStatus: "running" });
              sendToMeshAnalyze(hitSummaries, meshCbsZip.onEvent, meshCbsZip.onEnrichment).catch((err: Error) => {
                meshCbsZip.onEvent({ type: "error", message: err.message });
              });
            }
          } else if (event.type === "clinvar-scan-error") {
            set({ clinvarScanStatus: "error" });
          }
        }).catch(() => {
          set({ clinvarScanStatus: "error" });
        });
      }
    } catch (err) {
      const message =
        err instanceof ParseError
          ? err.message
          : "Could not read this file. Please upload a 23andMe, AncestryDNA, MyHeritage, or VCF raw export, or a GWAS health report.";
      set({ status: "error", error: message, genome: null, findings: [], healthReport: null });
    }
  },

  setView(view) {
    set({ view });
  },

  selectVariant(rsid) {
    set({ selectedRsid: rsid });
  },

  acknowledgeNotice() {
    set({ noticeAcknowledged: true });
  },

  async wipeAll() {
    await wipePersisted();
    set({
      genome: null,
      findings: [],
      fileName: null,
      status: "idle",
      error: null,
      parseMs: 0,
      matchMs: 0,
      sessionStart: 0,
      healthReport: null,
      meshEvents: [],
      meshStatus: "idle",
      meshEnrichments: {},
      meshGeneData: {},
      clinvarHits: [],
      clinvarScanStatus: "idle",
      clinvarScanProgress: null,
      view: "upload",
      selectedRsid: null,
    });
  },
}));

// Derived selector: merges KB findings + ClinVar pathogenic hits + mesh-enriched
// variants into one unified findings array for the trace view and karyotype.
// Deduplicates by rsid (KB findings take precedence).
export function useAllFindings(): Finding[] {
  const findings = useGenomeStore((s) => s.findings);
  const clinvarHits = useGenomeStore((s) => s.clinvarHits);
  const meshEnrichments = useGenomeStore((s) => s.meshEnrichments);
  const genome = useGenomeStore((s) => s.genome);

  return useMemoShallow(() => {
    if (!genome) return findings;

    const kbRsids = new Set(findings.map((f) => f.entry.rsid));
    const extra: Finding[] = [];

    // ClinVar pathogenic hits not already in the KB
    for (const hit of clinvarHits) {
      if (kbRsids.has(hit.rsid)) continue;
      const variant = genome.byRsid.get(hit.rsid) ?? null;
      if (!variant) continue;
      kbRsids.add(hit.rsid);

      extra.push({
        entry: {
          rsid: hit.rsid,
          gene: hit.gene ?? "",
          category: "disease-risk",
          effectAlleleFwd: "",
          genotypeInterpretation: {},
          tier: "A",
          sources: [{ db: "ClinVar", id: String(hit.clinvarId ?? ""), url: hit.clinvarId ? `https://www.ncbi.nlm.nih.gov/clinvar/variation/${hit.clinvarId}/` : "" }],
          caveats: "Discovered by full-genome ClinVar scan. Verify with a genetic counselor.",
        },
        variant,
        genotype: variant.genotype,
        copies: null,
        interpretation: `${hit.significance}${hit.condition ? ` — ${hit.condition}` : ""}`,
        covered: true,
        noCall: false,
        lowConfidence: false,
        indeterminate: false,
      });
    }

    // Mesh-enriched variants not already covered
    for (const [rsid, enrich] of Object.entries(meshEnrichments)) {
      if (kbRsids.has(rsid)) continue;
      const variant = genome.byRsid.get(rsid) ?? null;
      if (!variant) continue;
      if (!enrich.clinvarSignificance && enrich.gnomadAf == null && !enrich.pharmgkbId && !enrich.curatorNote) continue;
      kbRsids.add(rsid);

      const parts: string[] = [];
      if (enrich.curatorNote) parts.push(enrich.curatorNote);
      if (enrich.clinvarSignificance) parts.push(`ClinVar: ${enrich.clinvarSignificance}`);
      if (enrich.gnomadAf != null) parts.push(`gnomAD AF: ${enrich.gnomadAf.toFixed(4)}`);
      if (enrich.pharmgkbId) parts.push(`PharmGKB: ${enrich.pharmgkbId}`);

      const cat = enrich.pharmgkbId ? "pharmacogenomic" : "disease-risk";
      extra.push({
        entry: {
          rsid,
          gene: enrich.geneSymbol ?? "",
          category: cat as import("../kb/types").KbCategory,
          effectAlleleFwd: "",
          genotypeInterpretation: {},
          tier: "C",
          sources: [{ db: "MyVariant.info", id: rsid, url: `https://myvariant.info/v1/variant/${rsid}` }],
          caveats: "Discovered by MCP enrichment scan. Educational only.",
        },
        variant,
        genotype: variant.genotype,
        copies: null,
        interpretation: parts.join(" · "),
        covered: true,
        noCall: false,
        lowConfidence: false,
        indeterminate: false,
      });
    }

    return extra.length > 0 ? [...findings, ...extra] : findings;
  }, [findings, clinvarHits, meshEnrichments, genome]);
}

// Shallow memoization — avoids re-renders when the output is structurally equal.
function useMemoShallow<T>(factory: () => T, deps: unknown[]): T {
  const ref = useRef<{ deps: unknown[]; value: T } | null>(null);
  const depsChanged = !ref.current || deps.some((d, i) => d !== ref.current!.deps[i]);
  if (depsChanged) {
    ref.current = { deps, value: factory() };
  }
  return ref.current!.value;
}
