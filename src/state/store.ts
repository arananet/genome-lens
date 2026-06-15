import { create } from "zustand";
import { matchGenome } from "../analysis/match";
import type { Finding } from "../analysis/types";
import { parseGenomeFile, parseGenomeText, readText } from "../parse";
import {
  detect24Genetics,
  parse24Genetics,
  type ParsedReport24G,
} from "../parse/parse24Genetics";
import { ParseError, type ParsedGenome } from "../parse/types";
import {
  detectHealthReport,
  parseHealthReport,
  type ParsedHealthReport,
} from "../parse/parseHealthReport";
import { wipePersisted } from "./persist";

export type View = "upload" | "trace" | "karyotype" | "reports" | "search" | "wiki";

interface GenomeState {
  genome: ParsedGenome | null;
  findings: Finding[];
  report24G: ParsedReport24G | null;
  fileName: string | null;
  status: "idle" | "parsing" | "ready" | "error";
  error: string | null;
  parseMs: number;
  matchMs: number;
  sessionStart: number;

  healthReport: ParsedHealthReport | null;

  view: View;
  selectedRsid: string | null;

  noticeAcknowledged: boolean;

  loadFile: (file: File) => Promise<void>;
  closeReport24G: () => void;
  setView: (view: View) => void;
  selectVariant: (rsid: string | null) => void;
  acknowledgeNotice: () => void;
  wipeAll: () => Promise<void>;
}


export const useGenomeStore = create<GenomeState>((set) => ({
  genome: null,
  findings: [],
  report24G: null,
  fileName: null,
  status: "idle",
  error: null,
  parseMs: 0,
  matchMs: 0,
  sessionStart: 0,

  healthReport: null,

  view: "upload",
  selectedRsid: null,

  noticeAcknowledged: false,

  async loadFile(file) {
    set({
      status: "parsing",
      error: null,
      fileName: file.name,
      healthReport: null,
      report24G: null,
    });
    try {
      const isZip = file.name.toLowerCase().endsWith(".zip");

      if (!isZip) {
        const text = await readText(file);

        // 24Genetics health reports are plain-text PDF extractions. Detect
        // them up front and route to the dedicated report.
        if (detect24Genetics(text)) {
          set({
            report24G: parse24Genetics(text),
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
        set({
          genome,
          findings,
          status: "ready",
          error: null,
          parseMs,
          matchMs,
          sessionStart,
          view: "trace",
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
        set({
          genome,
          findings,
          status: "ready",
          error: null,
          parseMs,
          matchMs,
          sessionStart,
          view: "trace",
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

  closeReport24G() {
    set({ report24G: null, fileName: null, status: "idle", view: "upload" });
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
    await wipePersisted(); // clears any legacy IndexedDB data
    set({
      genome: null,
      findings: [],
      report24G: null,
      fileName: null,
      status: "idle",
      error: null,
      parseMs: 0,
      matchMs: 0,
      sessionStart: 0,
      healthReport: null,
      view: "upload",
      selectedRsid: null,
    });
  },
}));
