import { create } from "zustand";
import { matchGenome } from "../analysis/match";
import type { Finding } from "../analysis/types";
import { parseGenomeFile } from "../parse";
import { ParseError, type ParsedGenome } from "../parse/types";
import { wipePersisted } from "./persist";

export type View = "upload" | "trace" | "karyotype" | "reports" | "search" | "wiki";

interface GenomeState {
  genome: ParsedGenome | null;
  findings: Finding[];
  fileName: string | null;
  status: "idle" | "parsing" | "ready" | "error";
  error: string | null;
  parseMs: number;
  matchMs: number;
  sessionStart: number;

  view: View;
  selectedRsid: string | null;

  noticeAcknowledged: boolean;

  loadFile: (file: File) => Promise<void>;
  setView: (view: View) => void;
  selectVariant: (rsid: string | null) => void;
  acknowledgeNotice: () => void;
  wipeAll: () => Promise<void>;
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

  view: "upload",
  selectedRsid: null,

  noticeAcknowledged: false,

  async loadFile(file) {
    set({ status: "parsing", error: null, fileName: file.name });
    try {
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
    } catch (err) {
      const message =
        err instanceof ParseError
          ? err.message
          : "Could not read this file. Please upload a 23andMe, AncestryDNA, or MyHeritage raw export.";
      set({ status: "error", error: message, genome: null, findings: [] });
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
    await wipePersisted(); // clears any legacy IndexedDB data
    set({
      genome: null,
      findings: [],
      fileName: null,
      status: "idle",
      error: null,
      parseMs: 0,
      matchMs: 0,
      sessionStart: 0,
      view: "upload",
      selectedRsid: null,
    });
  },
}));
