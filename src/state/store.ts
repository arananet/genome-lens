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

  view: View;
  selectedRsid: string | null;

  noticeAcknowledged: boolean;

  loadFile: (file: File) => Promise<void>;
  setView: (view: View) => void;
  selectVariant: (rsid: string | null) => void;
  acknowledgeNotice: () => void;
  wipeAll: () => Promise<void>;
}

// Stream mesh-analyze SSE and dispatch events into the store.
// Called fire-and-forget after local genome analysis completes.
async function streamMeshAnalysis(
  findings: Finding[],
  onEvent: (e: MeshEvent) => void,
  onEnrichment: (enrichments: Record<string, VariantEnrichment>, geneData: Record<string, GeneEnrichment>) => void,
): Promise<void> {
  const summaries = findings
    .filter((f) => f.covered)
    .sort((a, b) => (a.entry.tier < b.entry.tier ? -1 : 1)) // A before B before C
    .slice(0, 30)
    .map((f) => ({ rsid: f.entry.rsid, gene: f.entry.gene, category: f.entry.category, tier: f.entry.tier }));

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

        // Fire real agent mesh analysis (non-blocking — UI is already usable)
        set({ meshStatus: "running" });
        streamMeshAnalysis(
          findings,
          (event) => {
            set((state) => {
              const isDone = event.type === "pipeline-done";
              const isError = event.type === "error" || event.type === "pipeline-blocked";
              return {
                meshEvents: [...state.meshEvents, event],
                meshStatus: isDone ? "done" : isError ? "error" : "running",
              };
            });
          },
          (enrichments, geneData) => {
            set({ meshEnrichments: enrichments, meshGeneData: geneData });
          },
        ).catch((err: Error) => {
          set((state) => ({
            meshEvents: [...state.meshEvents, { type: "error", message: String(err.message) }],
            meshStatus: "error",
          }));
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

        set({ meshStatus: "running" });
        streamMeshAnalysis(
          findings,
          (event) => {
            set((state) => {
              const isDone = event.type === "pipeline-done";
              const isError = event.type === "error" || event.type === "pipeline-blocked";
              return {
                meshEvents: [...state.meshEvents, event],
                meshStatus: isDone ? "done" : isError ? "error" : "running",
              };
            });
          },
          (enrichments, geneData) => {
            set({ meshEnrichments: enrichments, meshGeneData: geneData });
          },
        ).catch((err: Error) => {
          set((state) => ({
            meshEvents: [...state.meshEvents, { type: "error", message: String(err.message) }],
            meshStatus: "error",
          }));
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
      view: "upload",
      selectedRsid: null,
    });
  },
}));
